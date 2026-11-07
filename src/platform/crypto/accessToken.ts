import { createHash, randomBytes } from 'node:crypto';

export function generateAccessToken(prefix: string): string {
	return prefix + randomBytes(32).toString('base64url');
}

// 256 random bits need no salt or slow hash: the digest only has to be one-way.
export function hashAccessToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}
