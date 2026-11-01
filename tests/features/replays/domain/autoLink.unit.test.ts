import { describe, expect, it } from 'vitest';
import { pickEpisode, pickMission } from '@/features/replays/domain/autoLink';

const HOUR = 3600;
const START = 1_793_563_200;

describe('pickMission', () => {
	it('takes the one mission announced around the game', () => {
		const missions = [
			{ id: 1, startsAt: START - 7 * 24 * HOUR },
			{ id: 2, startsAt: START + HOUR },
		];
		expect(pickMission(START, missions)).toBe(2);
	});

	it('reaches a late episode of the evening and a server loaded ahead of time', () => {
		expect(pickMission(START, [{ id: 3, startsAt: START - 9 * HOUR }])).toBe(3);
		expect(pickMission(START, [{ id: 4, startsAt: START + 2 * HOUR }])).toBe(4);
	});

	it('leaves the game unlinked when no mission or several fit', () => {
		expect(pickMission(START, [{ id: 1, startsAt: START - 11 * HOUR }])).toBeNull();
		expect(pickMission(START, [{ id: 1, startsAt: START + 3 * HOUR }])).toBeNull();
		expect(
			pickMission(START, [
				{ id: 1, startsAt: START },
				{ id: 2, startsAt: START + HOUR },
			])
		).toBeNull();
	});
});

describe('pickEpisode', () => {
	const evening = [
		{ episodeNumber: 1, at: START + 0.5 * HOUR },
		{ episodeNumber: 2, at: START + 2.5 * HOUR },
	];

	it('takes the first "episode started" post after the game started', () => {
		expect(pickEpisode(START, evening, 2)).toBe(1);
		expect(pickEpisode(START + 2 * HOUR, evening, 2)).toBe(2);
	});

	it('accepts a post made just before the server reloaded the mission', () => {
		expect(pickEpisode(START + 2.5 * HOUR + 600, evening, 2)).toBe(2);
	});

	it('does not reach for a later episode when the post for this one is missing', () => {
		expect(pickEpisode(START, [{ episodeNumber: 2, at: START + 2.5 * HOUR }], 2)).toBeNull();
	});

	it('needs no post for a mission of one episode', () => {
		expect(pickEpisode(START, [], 1)).toBe(1);
		expect(pickEpisode(START, [], 3)).toBeNull();
	});
});
