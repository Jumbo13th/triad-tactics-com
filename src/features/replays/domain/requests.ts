import { z } from 'zod';
import { DEFAULT_REPLAY_SORT, REPLAY_SEARCH_MAX_LENGTH, REPLAY_SORTS, isReplayDay } from './search';

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

// A terrain is a folder name under worlds/; short codes are capped where missions cap them.
const TERRAIN_MAX_LENGTH = 100;
const MISSION_MAX_LENGTH = 64;

const boundedText = (max: number) =>
	z
		.preprocess(firstValue, z.string())
		.transform((value) => value.trim().slice(0, max).trim())
		.catch('');

const day = z.preprocess(firstValue, z.string().trim().refine(isReplayDay)).catch('');

// The address bar is free to edit, so a value that makes no sense falls back to the plain
// list rather than an error page. The page number is clamped to the results later, and a
// terrain or mission is checked against the published games before it filters.
export const replayListQuerySchema = z.object({
	q: boundedText(REPLAY_SEARCH_MAX_LENGTH),
	terrain: boundedText(TERRAIN_MAX_LENGTH),
	mission: boundedText(MISSION_MAX_LENGTH),
	from: day,
	to: day,
	sort: z.preprocess(firstValue, z.enum(REPLAY_SORTS)).catch(DEFAULT_REPLAY_SORT),
	page: z.preprocess(firstValue, z.coerce.number().int().min(1)).catch(1),
});
