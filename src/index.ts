import { DiscordFS } from "./discord-fs";
import { existsSync as fileExists } from "fs";
import { FtpSrv } from "ftp-srv";
import { readFile, writeFile } from "fs/promises";

function getEnv(key: string): string {
	const value = process.env[key];
	if (value == null) {
		console.log(`Missing environment variable ${key}`);
		process.exit(1);
	}
	return value;
}

async function main() {
	const BOT_TOKEN = getEnv("BOT_TOKEN");
	const FS_CHANNEL_ID = getEnv("FS_CHANNEL_ID");
	const authFilename = "auth.txt";

	let authKey: string;
	if (!fileExists(authFilename)) {
		authKey = await DiscordFS.createKey(BOT_TOKEN, FS_CHANNEL_ID);
		await writeFile(authFilename, authKey);
	}
	else {
		authKey = await readFile(authFilename, 'utf-8');
	}

	const FS = await DiscordFS.authenticate({
		botToken: BOT_TOKEN,
		channelID: FS_CHANNEL_ID,
		FSKey: authKey
	});
	const ftpServer = new FtpSrv({
		anonymous: true,
		url: "http://127.0.0.1:2121",
		pasv_url: "http://127.0.0.1:2121"
	});
	ftpServer.on("login", async(loginData, resolve) => {
		resolve({
			fs: await FS.getFTP(),
			cwd: "/"
		});
	});
	ftpServer.listen();
}

main();