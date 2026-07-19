import { createHash } from 'node:crypto';
import { z } from 'zod';

// "ll-stats/1" — the snapshot file from the game server's $profile:LL_GameStats/.
// Parsed tolerantly (unknown keys ignored, most fields default) so a
// crash-recovered "-live" file uploads as well as a GM-approved one.

export const DEFAULT_STATS_CONFIG = {
	FragPoints: 1,
	ZoneFragMultiplier: 2,
	AiKillWeight: 0,
	TeamkillPoints: -2,
	SurvivorPoints: 1,
	SideWinMultiplier: 1.25,
	CommanderWinMultiplier: 1.5,
} as const;

export const statsConfigSchema = z
	.object({
		FragPoints: z.number().default(DEFAULT_STATS_CONFIG.FragPoints),
		ZoneFragMultiplier: z.number().default(DEFAULT_STATS_CONFIG.ZoneFragMultiplier),
		AiKillWeight: z.number().default(DEFAULT_STATS_CONFIG.AiKillWeight),
		TeamkillPoints: z.number().default(DEFAULT_STATS_CONFIG.TeamkillPoints),
		SurvivorPoints: z.number().default(DEFAULT_STATS_CONFIG.SurvivorPoints),
		SideWinMultiplier: z.number().default(DEFAULT_STATS_CONFIG.SideWinMultiplier),
		CommanderWinMultiplier: z.number().default(DEFAULT_STATS_CONFIG.CommanderWinMultiplier),
	})
	.default({ ...DEFAULT_STATS_CONFIG });

const snapshotPlayerSchema = z.object({
	guid: z.string(),
	name: z.string().default(''),
	callsign: z.string().default(''),
	unitTag: z.string().default(''),
	unitName: z.string().default(''),
	faction: z.string().default(''),
	participated: z.boolean().default(false),
});

const snapshotEventSchema = z.object({
	t: z.number().default(0),
	type: z.string(),
	actor: z.string().default(''),
	victim: z.string().default(''),
	source: z.string().default(''),
	detail: z.string().default(''),
	points: z.number().default(0),
	cap: z.number().default(0),
});

const snapshotZoneSchema = z.object({
	name: z.string().default(''),
	entityName: z.string().default(''),
	pool: z.number().default(0),
	maxPerPlayer: z.number().default(0),
	attackerFaction: z.string().default(''),
	defenderFaction: z.string().default(''),
	captured: z.boolean().default(false),
	resolved: z.boolean().default(false),
	presence: z.array(z.object({ guid: z.string(), seconds: z.number().default(0) })).default([]),
});

export const snapshotSchema = z.object({
	schema: z.literal('ll-stats/1'),
	sessionId: z.string().default(''),
	phase: z.string().default(''),
	missionName: z.string().default(''),
	world: z.string().default(''),
	startedAt: z.string().default(''),
	endedAt: z.string().default(''),
	savedAt: z.string().default(''),
	winner: z.string().default(''),
	config: statsConfigSchema,
	factions: z.array(z.string()).default([]),
	commanders: z.array(z.object({ faction: z.string().default(''), unitTag: z.string().default('') })).default([]),
	players: z.array(snapshotPlayerSchema).default([]),
	events: z.array(snapshotEventSchema).default([]),
	zones: z.array(snapshotZoneSchema).default([]),
});

export type StatsSnapshot = z.infer<typeof snapshotSchema>;
export type StatsConfig = z.infer<typeof statsConfigSchema>;
export type SnapshotPlayer = z.infer<typeof snapshotPlayerSchema>;
export type SnapshotEvent = z.infer<typeof snapshotEventSchema>;

export type ParseSnapshotResult =
	| { success: true; snapshot: StatsSnapshot; hash: string; raw: string }
	| { success: false; error: 'invalid_json' | 'invalid_snapshot' };

export function parseSnapshot(text: string): ParseSnapshotResult {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return { success: false, error: 'invalid_json' };
	}

	const parsed = snapshotSchema.safeParse(json);
	if (!parsed.success) {
		return { success: false, error: 'invalid_snapshot' };
	}

	// Hash the NORMALIZED snapshot, not the pasted text — re-pasting the same
	// file with different whitespace is still the same upload.
	const canonical = JSON.stringify(parsed.data);
	const hash = createHash('sha256').update(canonical).digest('hex');

	return { success: true, snapshot: parsed.data, hash, raw: canonical };
}
