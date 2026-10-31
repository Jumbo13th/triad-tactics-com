import { z } from 'zod';

// Shapes of the replay API answers. Kept apart from the protocol module, which needs
// node:crypto, so pages can parse the answers in the browser.

const replayGameListItemSchema = z.object({
	id: z.number(),
	serverId: z.string(),
	session: z.string(),
	over: z.enum(['stopped', 'abandoned']),
	mission: z.string().nullable(),
	world: z.string().nullable(),
	/** UTC Unix seconds at the start of the first segment. */
	startedAt: z.number().nullable(),
	segmentCount: z.number(),
	size: z.number(),
	encodedSize: z.number(),
	hasIdentity: z.boolean(),
	hasStats: z.boolean(),
	postCount: z.number(),
	firstPostedAt: z.string(),
	lastPostedAt: z.string(),
	missionId: z.number().nullable(),
	missionTitle: z.string().nullable(),
	episodeNumber: z.number().nullable(),
	publishedAt: z.string().nullable(),
});

export type ReplayGameListItem = z.infer<typeof replayGameListItemSchema>;

export const adminReplaysResponseSchema = z.object({
	games: z.array(replayGameListItemSchema),
	hasMore: z.boolean(),
});

const replayGameDetailSchema = replayGameListItemSchema.extend({
	announcedAt: z.string().nullable(),
	statistics: z.object({ id: z.number(), status: z.enum(['draft', 'published']) }).nullable(),
	hasMap: z.boolean(),
	map: z.object({ relief: z.boolean(), topo: z.boolean() }),
});

export type ReplayGameDetail = z.infer<typeof replayGameDetailSchema>;

const missionOptionSchema = z.object({
	id: z.number(),
	title: z.string(),
	shortCode: z.string().nullable(),
	startsAt: z.string().nullable(),
});

export const adminReplayDetailResponseSchema = z.object({
	game: replayGameDetailSchema,
	missions: z.array(missionOptionSchema),
});

export type PublicReplayListItem = {
	id: number;
	missionTitle: string;
	missionShortCode: string | null;
	episodeNumber: number;
	world: string | null;
	startedAt: number | null;
	publishedAt: string;
	statsId: number | null;
};

/** What the replay page hands the player: everything else comes from the files. */
export type PublicReplayGame = PublicReplayListItem & {
	segments: { sha256: string; size: number }[];
	map: { relief: string | null; topo: string | null };
};
