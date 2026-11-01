import { createHmac } from 'node:crypto';
import { z } from 'zod';

// ll-upload/1: the protocol the Lite Lobby host service (ll-uplink) sends finished games
// with. The full reference ships with the service as contracts/upload-protocol.md.

export const UPLOAD_BASE_PATH = '/api/replays/v1';

// The host splits the gzip stream into pieces of at most this size; kamal-proxy caps
// request bodies at 2 MB, so nothing larger can arrive anyway.
export const PIECE_MAX_BYTES = 1_500_000;
export const JSON_MAX_BYTES = 64 * 1024;
export const CLOCK_SKEW_SECONDS = 300;
export const MIN_SECRET_LENGTH = 32;

// A two-hour game sends about 10 MB. These bound what one commit holds in memory and how
// far an inflating stream may run, with room for games many times longer.
export const MAX_PIECES = 100;
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_SEGMENTS = 500;

export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export const replayFileKinds = ['segment', 'identity', 'stats'] as const;
export type ReplayFileKind = (typeof replayFileKinds)[number];

export const replayGameEndings = ['stopped', 'abandoned'] as const;
export type ReplayGameEnding = (typeof replayGameEndings)[number];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SERVER_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const PIECE_INDEX_PATTERN = /^(0|[1-9][0-9]{0,2})$/;

export function isSha256(value: string): boolean {
	return SHA256_PATTERN.test(value);
}

export function isServerId(value: string): boolean {
	return SERVER_ID_PATTERN.test(value);
}

export function parsePieceIndex(value: string): number | null {
	if (!PIECE_INDEX_PATTERN.test(value)) return null;
	const index = Number(value);
	return index < MAX_PIECES ? index : null;
}

const sha256Schema = z.string().regex(SHA256_PATTERN);

// "<date>-<time>-<world>": the world part is the mission's world file name, so only
// control characters and path separators are refused.
const sessionSchema = z
	.string()
	.min(1)
	.max(128)
	.refine((s) => [...s].every((ch) => ch >= ' ' && ch !== '\u007f' && ch !== '/' && ch !== '\\'));

export const fileCommitSchema = z.object({
	kind: z.enum(replayFileKinds),
	session: sessionSchema,
	name: z.string().min(1).max(256),
	size: z.number().int().min(0).max(MAX_FILE_BYTES),
	encoding: z.literal('gzip'),
	encodedSize: z.number().int().min(1).max(MAX_PIECES * PIECE_MAX_BYTES),
	encodedSha256: sha256Schema,
	pieces: z.number().int().min(1).max(MAX_PIECES),
});
export type FileCommit = z.infer<typeof fileCommitSchema>;

export const gamePostSchema = z.object({
	session: sessionSchema,
	over: z.enum(replayGameEndings),
	segments: z.array(sha256Schema).min(1).max(MAX_SEGMENTS),
	identity: sha256Schema.nullish().transform((v) => v ?? null),
	stats: sha256Schema.nullish().transform((v) => v ?? null),
});
export type GamePost = z.infer<typeof gamePostSchema>;

/** Method, path relative to the base address with its query, timestamp and body hash. */
export function signUploadRequest(
	secret: string,
	method: string,
	path: string,
	timestamp: string,
	contentSha256: string
): string {
	return createHmac('sha256', secret).update(`${method}\n${path}\n${timestamp}\n${contentSha256}`).digest('hex');
}

export function storageKeyFor(kind: ReplayFileKind, sha256: string): string {
	return `${kind}/${sha256}.gz`;
}
