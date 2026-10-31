import { z } from 'zod';

// GET /api/admin/replays. Kept apart from the protocol module, which needs node:crypto,
// so the admin page can parse the answer in the browser.

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
});

export type ReplayGameListItem = z.infer<typeof replayGameListItemSchema>;

export const adminReplaysResponseSchema = z.object({
	games: z.array(replayGameListItemSchema),
	hasMore: z.boolean(),
});
