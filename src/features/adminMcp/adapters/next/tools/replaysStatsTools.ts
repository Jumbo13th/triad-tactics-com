import { z } from 'zod';
import { defineRouteTool, type AdminTool } from './defineTool';
import { getAdminReplaysRoute, postAdminReplaysRoute } from '@/features/replays/adapters/next/adminReplaysRoute';
import { postAdminMapRoute, putAdminMapPieceRoute } from '@/features/replays/adapters/next/adminMapRoutes';
import { adminReplayRequestSchema, mapCommitSchema } from '@/features/replays/domain/requests';
import { MAX_PIECES, PIECE_MAX_BYTES } from '@/features/replays/domain/protocol';
import { getAdminStatsRoute, postAdminStatsRoute } from '@/features/stats/adapters/next/adminStatsRoute';
import { adminStatsRequestSchema } from '@/features/stats/domain/requests';

/**
 * Splits a route whose body is a discriminated union on `action` into one tool per
 * action, so each tool carries its own annotations: the tool takes the variant's other
 * fields and sends the action itself.
 */
function actionBody(union: { options: readonly z.ZodObject[] }, action: string) {
	const variant = union.options.find((option) => {
		const discriminator = option.shape.action;
		return discriminator instanceof z.ZodLiteral && discriminator.values.has(action);
	});
	if (!variant) throw new Error(`admin_mcp_unknown_action: ${action}`);
	return {
		body: variant.omit({ action: true }),
		encodeBody: (args: Record<string, unknown>) => ({
			body: JSON.stringify({ ...args, action }),
			contentType: 'application/json'
		})
	};
}

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const replaysStatsTools: AdminTool[] = [
	defineRouteTool({
		name: 'replays_list',
		title: 'List replay games',
		description:
			'Lists games the game hosts have uploaded as replays, newest first, 50 per call, with server, session, world, start time, size, linked mission and episode, published time and the episode\'s statistics status. hasMore tells whether to call again with offset + 50.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/replays',
		query: {
			offset: z.number().int().min(0).optional().describe('Rows to skip; defaults to 0.')
		},
		handler: getAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_get',
		title: 'Show replay game',
		description:
			'Shows one replay game (id from replays_list) with its announcement time, linked episode statistics and whether its world has a map, plus the missions it can be linked to and the other worlds whose stored maps it can reuse.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/replays',
		query: {
			gameId: z.number().int().positive()
		},
		handler: getAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_link',
		title: 'Link replay to mission episode',
		description:
			'Links an unpublished replay game to a mission (id from replays_get) and episode number, replacing any earlier link; a published game must be unpublished first. The link decides where the replay appears once published.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'link'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_import_stats',
		title: 'Import replay statistics',
		description:
			'Takes the statistics file a linked replay game carries and makes it the draft statistics of its mission episode, replacing an existing draft including any mapping edits; refused when the episode\'s statistics are already published. Returns the gameStatsId to review with stats_get_game.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'importStats'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_publish',
		title: 'Publish replay',
		description:
			'Makes a linked replay game public in the replay viewer and indexes its players for search. The first successful publish posts an announcement to Discord; a publish whose post failed retries it. Returns the announcement outcome (sent, skipped, earlier or failed).',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'publish'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_unpublish',
		title: 'Unpublish replay',
		description:
			'Hides a published replay game from the public viewer. A Discord announcement already posted stays; publishing again does not repost it.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'unpublish'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_set_map',
		title: 'Set replay map files',
		description:
			'Points a mission world (the game\'s world path, e.g. "$Addon:worlds/Arland/LobbyDemo.ent") at stored map files by sha256: relief is the committed relief image, topo the committed geometry; null keeps the current one. Final step after replays_upload_map_piece and replays_commit_map; affects every replay on that world.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'setMap'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_reuse_map',
		title: 'Reuse another world\'s map',
		description:
			'Gives a mission world the complete map (relief and geometry) already stored for another world, from storedMaps in replays_get, replacing its own. Affects every replay on that world; 404 when the source has no complete map.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays',
		...actionBody(adminReplayRequestSchema, 'reuseMap'),
		handler: postAdminReplaysRoute
	}),
	defineRouteTool({
		name: 'replays_upload_map_piece',
		title: 'Upload map file piece',
		description:
			`Step 1 of a map upload: sends piece number index of one map file's encoded bytes as base64, at most ${PIECE_MAX_BYTES.toLocaleString('en-US')} bytes per piece. The encoded bytes are the WebP or PNG image for a relief, or the gzipped .topo file for geometry; sha is the file's sha256 as it will be committed (the image's own hash for a relief, the uncompressed .topo hash for geometry). Re-sending identical bytes is harmless; different bytes for a held piece discard the file's pieces (409) and the upload starts over. Then call replays_commit_map.`,
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'PUT',
		path: '/api/admin/replays/maps/pieces',
		query: {
			sha: sha256,
			index: z.number().int().min(0).max(MAX_PIECES - 1).describe('0-based piece number.')
		},
		body: z.object({
			dataBase64: z
				.base64()
				.min(1)
				.max(Math.ceil(PIECE_MAX_BYTES / 3) * 4)
				.describe('The piece\'s bytes, base64-encoded.')
		}),
		encodeBody: (args) => ({
			body: new Uint8Array(Buffer.from(String(args.dataBase64), 'base64')),
			contentType: 'application/octet-stream'
		}),
		handler: putAdminMapPieceRoute
	}),
	defineRouteTool({
		name: 'replays_commit_map',
		title: 'Commit uploaded map file',
		description:
			'Step 2 of a map upload: joins the pieces sent with replays_upload_map_piece and stores the file. kind is relief or topo; sha256 and size describe the decoded file, encodedSize and encodedSha256 the joined pieces (equal for a relief), pieces their count. Answers 409 with the missing piece numbers, or 422 when the bytes do not match (the pieces are then discarded). Then attach the file with replays_set_map.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/replays/maps',
		body: mapCommitSchema,
		handler: postAdminMapRoute
	}),
	defineRouteTool({
		name: 'stats_get',
		title: 'Show statistics overview',
		description:
			'Shows the statistics admin overview: all seasons and the active one, whether the main-page statistics teaser is hidden, the 30 most recent statistics records (draft and published) and the missions statistics can be uploaded for.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/stats',
		handler: getAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_get_game',
		title: 'Show game statistics record',
		description:
			'Shows one statistics record for review: its metadata, the player GUID→unit mapping with per-player previews, the computed unit score preview, timeline, factions, the snapshot\'s winner and commanders, the active season, all units and how many GUIDs matched no unit.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/stats',
		query: {
			gameStatsId: z.number().int().positive()
		},
		handler: getAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_list_games',
		title: 'List statistics records',
		description:
			'With missionId, lists every statistics record of that mission. Without it, lists all records newest first, 30 per call starting at gamesOffset.',
		annotations: { readOnlyHint: true },
		method: 'GET',
		path: '/api/admin/stats',
		query: {
			missionId: z.number().int().positive().optional(),
			gamesOffset: z.number().int().min(0).default(0).describe('Rows to skip; ignored with missionId.')
		},
		handler: getAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_upload',
		title: 'Upload statistics snapshot',
		description:
			'Creates the draft statistics of a mission episode from a game\'s statistics snapshot JSON (snapshotText), auto-mapping player GUIDs to units. Refused for an already published episode or a snapshot uploaded before; an existing draft is only overwritten with replaceDraft true. Returns the gameStatsId and the review view.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'upload'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_update_mapping',
		title: 'Edit statistics mapping',
		description:
			'Replaces a record\'s whole mapping: guidUnit (player GUID → unit id or null), winner side and commanders (faction + unit id). On a published record the frozen scores stay until it is published again. Returns the updated review view.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'updateMapping'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_publish',
		title: 'Publish game statistics',
		description:
			'Computes and freezes the unit scores from the record\'s snapshot and mapping and publishes them on the public statistics pages, in the active season (or season-less when none is open). Re-publishing recomputes the scores and moves the record into the current active season. Fails when no unit is mapped.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'publish'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_unpublish',
		title: 'Unpublish game statistics',
		description:
			'Removes a record\'s frozen unit scores from the public statistics and season standings and turns it back into a draft.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'unpublish'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_delete_draft',
		title: 'Delete statistics draft',
		description: 'Permanently deletes a draft statistics record and its snapshot. Irreversible; refused for a published record.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'deleteDraft'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_create_season',
		title: 'Open statistics season',
		description:
			'Opens a new statistics season with the given name; games published from now on count toward it on the public standings. Refused while another season is active.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'createSeason'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_close_season',
		title: 'Close statistics season',
		description:
			'Closes the active season (id from stats_get), ending its public standings; there is no way to reopen it. Games published afterwards are season-less until a new season is opened.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'closeSeason'),
		handler: postAdminStatsRoute
	}),
	defineRouteTool({
		name: 'stats_set_hidden',
		title: 'Hide or show statistics teaser',
		description:
			'Hides (hidden true) or shows the statistics teaser on the site\'s main page. The /stats pages and game-server endpoints stay reachable either way.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		method: 'POST',
		path: '/api/admin/stats',
		...actionBody(adminStatsRequestSchema, 'setStatsHidden'),
		handler: postAdminStatsRoute
	})
];
