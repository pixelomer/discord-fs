// An attempt to encode binary data with chinese characters.
// There are probably more efficient ways to do this, but I
// couldn't find any so I created my own implementation.
//
// Discord has a limit of 2000 characters per message. However,
// this limit applies to characters, not bytes. This means
// that it is possible to store more than 8 bits with a single
// character.

export function chineseGetEncodedSize(originalSize: number) {
	return 1 + Math.ceil(originalSize / 7) * 4;
}

export function chineseEncode(data: Buffer) {
	let result = "";
	let lastCharCount = 0;
	const buffer = Buffer.alloc(8);
	for (let i=0; i<data.length; i+=7) {
		// aaaaaaaaaaaaaa bbbbbbbbbbbbbb cccccccccccccc dddddddddddddd (encoded)
		// 00000000111111 11222222223333 33334444444455 55555566666666 (decoded)
		const originalChunk = data.slice(i, i+7);
		const charCount = originalChunk.length;

		buffer.fill(0);
		originalChunk.copy(buffer);

		const chars: number[] = [
			(buffer[0] << 6) | (buffer[1] >> 2),
			((buffer[1] & 0b11) << 12) | (buffer[2] << 4) | (buffer[3] >> 4),
			((buffer[3] & 0b1111) << 10) | (buffer[4] << 2) | (buffer[5] >> 6),
			((buffer[5] & 0b111111) << 8) | buffer[6],
		];
		
		for (let i=0; i<chars.length; i++) {
			buffer.writeUInt16LE(0x4E00 + chars[i], i*2);
		}
		result += buffer.toString('utf16le');
		
		lastCharCount = charCount;
	}
	result += lastCharCount;
	return result;
}

export function chineseGetDecodedSize(encoded: string) {
	let size = (((encoded.length - 1) / 4) * 7);
	if (!Number.isInteger(size)) {
		throw new Error("Invalid data");
	}
	const padding = encoded[encoded.length - 1];
	size -= 7 - parseInt(padding);
	return size;
}

export function chineseDecode(encoded: string) {
	const buffer = Buffer.allocUnsafe(chineseGetDecodedSize(encoded));
	for (let i=0; i<encoded.length; i+=4) {
		const outputOffset = (i / 4) * 7;
		if (outputOffset >= buffer.length) {
			break;
		}
		const chunk = Buffer.from(encoded.slice(i, i+4), 'utf16le');
		const chars: number[] = [
			chunk.readUInt16LE(0) - 0x4E00,
			chunk.readUInt16LE(2) - 0x4E00,
			chunk.readUInt16LE(4) - 0x4E00,
			chunk.readUInt16LE(6) - 0x4E00,
		];
		const decoded = Buffer.from([
			chars[0] >> 6,
			((chars[0] & 0b111111) << 2) | (chars[1] >> 12),
			(chars[1] >> 4) & 0b11111111,
			((chars[1] & 0b1111) << 4) | (chars[2] >> 10),
			(chars[2] >> 2) & 0b11111111,
			((chars[2] & 0b11) << 6) | (chars[3] >> 8),
			chars[3] & 0b11111111
		]);
		decoded.copy(buffer, outputOffset);
	}
	return buffer;
}