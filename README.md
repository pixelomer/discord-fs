# discord-fs

A simple AnyFS data provider for storing files on Discord.

## Usage

```bash
BOT_TOKEN="bot-token-here" FS_CHANNEL_ID="channel-id-here" npm start
```

This command will initialize a new filesystem in the specified channel using the specified bot. It will then start an FTP server on port 2121 which you can use to upload and download files.

## Warning

This project is purely a proof of concept and should not be used for serious applications. Uploading and downloading files with discord-fs is a very slow process and a portion of the filesystem or the entirety of it could become corrupted if a data transfer is interrupted.