import { z } from 'zod';
import { REPLAY_SEARCH_MAX_LENGTH } from './search';

const gameId = z.number().int().positive();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const adminReplayRequestSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('link'),
		gameId,
		missionId: z.number().int().positive(),
		episodeNumber: z.number().int().min(1).max(99),
	}),
	z.object({ action: z.literal('importStats'), gameId }),
	z.object({ action: z.literal('publish'), gameId }),
	z.object({ action: z.literal('unpublish'), gameId }),
	z.object({
		action: z.literal('setMap'),
		world: z.string().min(1).max(300),
		relief: sha256.nullable(),
		topo: sha256.nullable(),
	}),
]);

export type AdminReplayRequest = z.infer<typeof adminReplayRequestSchema>;

// A terrain's relief image is a few hundred kilobytes and its geometry a few megabytes.
const MAP_MAX_BYTES = 64 * 1024 * 1024;

export const mapCommitSchema = z.object({
	kind: z.enum(['relief', 'topo']),
	sha256,
	size: z.number().int().min(1).max(MAP_MAX_BYTES),
	encodedSize: z.number().int().min(1).max(MAP_MAX_BYTES),
	encodedSha256: sha256,
	pieces: z.number().int().min(1).max(64),
});

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

// The address bar is free to edit, so a value that makes no sense falls back to the plain
// list rather than an error page; the page number is clamped to the results later.
export const replayListQuerySchema = z.object({
	q: z
		.preprocess(firstValue, z.string())
		.transform((q) => q.trim().slice(0, REPLAY_SEARCH_MAX_LENGTH).trim())
		.catch(''),
	page: z.preprocess(firstValue, z.coerce.number().int().min(1)).catch(1),
});
