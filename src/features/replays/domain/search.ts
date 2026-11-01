// The public replay list's search. Every word has to match the game somewhere: the mission
// title, the terrain, or a player who took part, by site callsign or by in-game name. A
// bare number matches the episode or the title, since nearly every player list holds some
// digit; "E2" or "Ep2", as the site labels episodes, matches the episode alone.

export const REPLAY_SEARCH_MAX_LENGTH = 100;
const MAX_TERMS = 8;

export type ReplaySearchTerm =
	| { kind: 'text'; text: string }
	| { kind: 'number'; text: string; episode: number }
	| { kind: 'episode'; episode: number };

export type ReplaySearch = { terms: ReplaySearchTerm[] };

const EPISODE_LABEL = /^ep?\.?(\d{1,2})$/;
const NUMBER = /^\d{1,2}$/;

/** Terms are lowercased by toLowerCase, the same fold the infra applies to the text it compares them with. */
export function parseReplaySearch(query: string): ReplaySearch {
	const words = [...new Set(query.slice(0, REPLAY_SEARCH_MAX_LENGTH).toLowerCase().split(/\s+/).filter(Boolean))];
	const terms = words.slice(0, MAX_TERMS).map((word): ReplaySearchTerm => {
		const label = EPISODE_LABEL.exec(word);
		if (label) return { kind: 'episode', episode: Number(label[1]) };
		if (NUMBER.test(word)) return { kind: 'number', text: word, episode: Number(word) };
		return { kind: 'text', text: word };
	});
	return { terms };
}
