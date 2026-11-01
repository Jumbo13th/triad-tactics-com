// The public replay list's search and filters. Every word of the search has to match the game
// somewhere: the mission title, the terrain, or a player who took part, by site callsign or by
// in-game name. A bare number matches the episode or the title, since nearly every player list
// holds some digit; "E2" or "Ep2", as the site labels episodes, matches the episode alone.

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

export const REPLAY_SORTS = ['newest', 'oldest', 'players'] as const;
export type ReplaySort = (typeof REPLAY_SORTS)[number];
export const DEFAULT_REPLAY_SORT: ReplaySort = 'newest';

/** The list's filters as the address bar holds them; an empty string filters nothing. */
export type ReplayListFilters = {
	query: string;
	/** A terrain as the facets name it. */
	terrain: string;
	/** A mission short code as the facets name it. */
	mission: string;
	/** YYYY-MM-DD: the first day played, a UTC day. */
	from: string;
	/** YYYY-MM-DD: the last day played, a UTC day. */
	to: string;
	sort: ReplaySort;
};

/** What there is to filter by: the terrains and missions of the published games. */
export type ReplayFacets = {
	terrains: string[];
	missions: { shortCode: string; title: string }[];
};

/** The filters in the form the repository applies them. */
export type ReplayGameFilter = {
	search: ReplaySearch;
	/** Compared without regard to case. */
	terrain: string | null;
	missionShortCode: string | null;
	/** UTC Unix seconds the game started at or after. */
	startedFrom: number | null;
	/** UTC Unix seconds the game started before. */
	startedBefore: number | null;
};

/** In the viewer's alphabet; a title shared by two missions falls back to their short codes. */
export function sortFacets(facets: ReplayFacets, locale: string): ReplayFacets {
	const order = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
	return {
		terrains: [...facets.terrains].sort(order.compare),
		missions: [...facets.missions].sort(
			(a, b) => order.compare(a.title || a.shortCode, b.title || b.shortCode) || order.compare(a.shortCode, b.shortCode)
		),
	};
}

export function hasListFilters(filters: ReplayListFilters): boolean {
	return Boolean(filters.query || filters.terrain || filters.mission || filters.from || filters.to);
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayStart(day: string, offsetDays: number): number {
	const [, year, month, date] = DAY.exec(day) ?? [];
	return Date.UTC(Number(year), Number(month) - 1, Number(date) + offsetDays) / 1000;
}

/** A calendar day written YYYY-MM-DD, as a date input sends it. */
export function isReplayDay(value: string): boolean {
	const match = DAY.exec(value);
	if (!match) return false;
	const [year, month, date] = match.slice(1).map(Number);
	// Date.UTC rolls a day past the month's end into the next, and reads years below 100 as 19xx.
	const parsed = new Date(Date.UTC(year, month - 1, date));
	return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}

/**
 * The filters the list applies. A terrain or mission no published game has filters nothing, so a
 * link kept from before an unpublish still shows replays, and either is named as the facets spell
 * it; a range given backwards is turned around.
 */
export function applicableFilters(requested: ReplayListFilters, facets: ReplayFacets): ReplayListFilters {
	const terrain = facets.terrains.find((name) => name.toLowerCase() === requested.terrain.toLowerCase()) ?? '';
	const mission = facets.missions.find((m) => m.shortCode.toLowerCase() === requested.mission.toLowerCase())?.shortCode ?? '';
	const backwards = requested.from !== '' && requested.to !== '' && requested.from > requested.to;
	return {
		...requested,
		terrain,
		mission,
		from: backwards ? requested.to : requested.from,
		to: backwards ? requested.from : requested.to,
	};
}

// Days are UTC days: the server cannot know the viewer's zone, and the community plays in the
// European evening, hours away from midnight UTC.
export function toGameFilter(filters: ReplayListFilters): ReplayGameFilter {
	return {
		search: parseReplaySearch(filters.query),
		terrain: filters.terrain || null,
		missionShortCode: filters.mission || null,
		startedFrom: filters.from ? dayStart(filters.from, 0) : null,
		startedBefore: filters.to ? dayStart(filters.to, 1) : null,
	};
}
