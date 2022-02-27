import { Client, Intents, MessageAttachment, TextBasedChannel } from "discord.js";
import { AnyFS, AnyFSProvider } from "anyfs";
import crypto from "crypto";
import fetch from "node-fetch";
import { chineseDecode, chineseEncode, chineseGetEncodedSize } from "./chinese-encode";

interface DiscordAuth {
	client: Client,
	fsChannel: TextBasedChannel
}

interface DiscordCreds {
	botToken: string,
	channelID: string
}

interface DiscordFSCreds {
	FSKey: string
}

class DiscordFSProvider implements AnyFSProvider {
	private client: Client;
	private fsChannel: TextBasedChannel;

	async readObject(objectID: string) {
		const message = await this.fsChannel.messages.fetch(objectID);
		const content = message.content;
		const contentType = content.slice(0, 1);
		let data: Buffer;
		switch (contentType) {
			case "b":
				data = Buffer.from(message.content.slice(1), 'base64');
				break;
			case "c":
				data = chineseDecode(message.content.slice(1));
				break;
			case "u":
				const url = message.content.split(" ")[2];
				const response = await fetch(url);
				data = Buffer.from(await response.arrayBuffer());
				break;
			case "d":
				throw new Error("Data messages (type 'd') cannot be read directly.");
			case ".":
				throw new Error("Attempted to read a message with uninitialized data.");
			default:
				throw new Error("Attempted to read a corrupted message.");
		}
		return data;
	}

	private async deleteLinkedMessages(content: string) {
		const messageType = content.slice(0, 1);
		switch (messageType) {
			case "u":
				const linkedMessageID = content.split(' ')[1];
				if (linkedMessageID == null) {
					break;
				}
				const linkedMessage = await this.fsChannel.messages.fetch(linkedMessageID);
				if (linkedMessage == null) {
					break;
				}
				await linkedMessage.delete();
				break;
			default:
				break;
		}
	}

	async writeObject(objectID: string, data: Buffer) {
		const message = await this.fsChannel.messages.fetch(objectID);
		const oldContent = message.content;

		// Update the message
		const encodedSize = chineseGetEncodedSize(data.length);
		if (encodedSize <= 1999) {
			const encoded = chineseEncode(data);
			await message.edit(`c${encoded}`);
		}
		else {
			const attachment = new MessageAttachment(data, "data");
			const dataMessage = await this.fsChannel.send({
				files: [attachment]
			});
			for (const attachment of dataMessage.attachments.values()) {
				await message.edit(`u ${dataMessage.id} ${attachment.url}`);
				break;
			}
		}

		// Once the message is updated, delete any previous data that might
		// have been stored in a separate message
		await this.deleteLinkedMessages(oldContent);
	}

	async createObject() {
		const message = await this.fsChannel.send(".");
		return message.id;	
	}

	async deleteObject(objectID: string): Promise<boolean> {
		try {
			const message = await this.fsChannel.messages.fetch(objectID);
			const content = message.content;
			await message.delete();
			await this.deleteLinkedMessages(content);
			return true;
		}
		catch {
			return false;
		}
	}

	constructor(client: Client, fsChannel: TextBasedChannel) {
		this.client = client;
		this.fsChannel = fsChannel;
	}
}

export class DiscordFS extends AnyFS {
	private constructor(client: Client, fsChannel: TextBasedChannel, AESKey: Buffer, rootID: any) {
		const provider = new DiscordFSProvider(client, fsChannel);
		// 64KB per chunk
		super(provider, AESKey, 1024 * 64, rootID);
	}

	private static async discordAuth(token: string, channelID: string): Promise<DiscordAuth> {
		return new Promise<DiscordAuth>((resolve, reject) => {
			const client = new Client({
				intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
			});
			
			client.on("ready", ()=>{
				client.channels.fetch(channelID).then((fsChannel) => {
					if (fsChannel?.isText()) {
						resolve({ client, fsChannel });
					}
					else {
						reject(new Error("Specified channel ID is not for a text channel."));
					}
				}).catch((error) => {
					reject(error);
				})
			});

			client.on("error", (error) => {
				reject(error);
			})
			
			client.login(token);
		});
	}

	static async authenticate(options: DiscordCreds & DiscordFSCreds) {
		const decodedKey = Buffer.from(options.FSKey, 'base64').toString('utf-8');
		const components = decodedKey.split("|");
		const messageID = components[0];
		const decodedAESKey = Buffer.from(components[1], 'base64');
		const { client, fsChannel } = await this.discordAuth(options.botToken, options.channelID);
		return new DiscordFS(client, fsChannel, decodedAESKey, messageID);
	}

	static async createKey(token: string, channelID: string): Promise<string> {
		const { client, fsChannel } = await this.discordAuth(token, channelID);
		try {
			const message = await fsChannel.send(".");
			const AESKey = crypto.randomBytes(32);
			const decodedKey = `${message.id}|${AESKey.toString('base64')}`;
			return Buffer.from(decodedKey).toString('base64');
		}
		finally {
			client.destroy();
		}
	}
}