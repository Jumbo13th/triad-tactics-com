import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const HEAD_BYTES = 8 * 1024;

export type Inflated = {
	size: number;
	sha256: string;
	/** The first bytes of the content, enough for a segment's header. */
	head: string;
};

export function sha256Hex(data: Buffer): string {
	return createHash('sha256').update(data).digest('hex');
}

/** The whole content of a small stored file, or null when it is not the file it claims to be. */
export async function inflateText(encoded: Buffer, size: number, sha256: string): Promise<string | null> {
	const chunks: Buffer[] = [];
	let total = 0;
	try {
		await pipeline(Readable.from([encoded], { objectMode: false }), createGunzip(), async (source: AsyncIterable<Buffer>) => {
			for await (const chunk of source) {
				total += chunk.length;
				if (total > size) throw new Error('inflated_past_size');
				chunks.push(chunk);
			}
		});
	} catch {
		return null;
	}
	const content = Buffer.concat(chunks);
	return total === size && sha256Hex(content) === sha256 ? content.toString('utf8') : null;
}

// Inflates as a stream so a file is never held uncompressed, and stops once the output
// passes `limit` so a stream that inflates far beyond its declared size costs nothing.
export async function inflate(encoded: Buffer, limit: number): Promise<Inflated | null> {
	const hash = createHash('sha256');
	const head: Buffer[] = [];
	let headBytes = 0;
	let size = 0;
	try {
		await pipeline(Readable.from([encoded], { objectMode: false }), createGunzip(), async (source: AsyncIterable<Buffer>) => {
			for await (const chunk of source) {
				size += chunk.length;
				if (size > limit) throw new Error('inflated_past_limit');
				hash.update(chunk);
				if (headBytes < HEAD_BYTES) {
					const part = chunk.subarray(0, HEAD_BYTES - headBytes);
					head.push(part);
					headBytes += part.length;
				}
			}
		});
	} catch {
		return null;
	}
	return { size, sha256: hash.digest('hex'), head: Buffer.concat(head).toString('utf8') };
}
