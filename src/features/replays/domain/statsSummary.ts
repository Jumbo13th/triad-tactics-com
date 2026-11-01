// What the replay viewer shows of a game's published statistics. The page fills it from
// the statistics feature, so replays never read statistics themselves.
export type ReplayStatsSummary = {
	id: number;
	/** Faction key, 'draw', or '' when no result was declared. */
	winnerSide: string;
	sides: { side: string; kills: number; deaths: number; teamkills: number; participants: number; survivors: number; points: number }[];
	/** The best units by points, best first. */
	units: { unitTag: string; unitName: string; side: string; points: number; kills: number; deaths: number; winner: boolean; commander: boolean }[];
	unitCount: number;
};
