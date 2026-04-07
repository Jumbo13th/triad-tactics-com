import type { useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import type { GameMissionUpdate } from '@/features/games/domain/types';
import { formatMissionUpdateMessage } from '@/features/games/ui/missionPageUtils';

function createGamesTranslator() {
	return ((key: string, values?: Record<string, unknown>) => {
		switch (key) {
			case 'missionUpdateEpisodePrefix':
				return `Episode ${values?.episodeNumber}.`;
			case 'missionUpdateKindUnitsSlottingStarted':
				return 'Units slotting started.';
			case 'missionUpdateKindPrioritySlottingStarted':
				return 'Priority slotting started.';
			case 'missionUpdateKindRegularSlottingStarted':
				return 'Regular slotting started.';
			case 'missionUpdateKindGameStartedWaitNextEpisode':
				return `Game started. Please wait until Episode ${values?.nextEpisodeNumber} of ${values?.totalEpisodes} starts.`;
			case 'missionUpdateKindGameStartedWaitNextEpisodeGeneric':
				return 'Game started. Please wait until the next episode starts.';
			case 'missionUpdateKindGameStartedLastEpisode':
				return 'Game started. This is the last episode.';
			default:
				return key;
		}
	}) as unknown as ReturnType<typeof useTranslations<'games'>>;
}

function buildUpdate(input: Partial<GameMissionUpdate>): GameMissionUpdate {
	return {
		id: 1,
		kind: 'units_slotting_started',
		episodeNumber: 1,
		totalEpisodes: 3,
		createdAt: '2026-03-20 18:00:00',
		createdBySteamId64: '76561198012345678',
		...input
	};
}

describe('formatMissionUpdateMessage', () => {
	it('prefixes slotting updates with a localized episode number', () => {
		const t = createGamesTranslator();

		expect(formatMissionUpdateMessage(buildUpdate({ kind: 'units_slotting_started', episodeNumber: 1 }), t)).toBe(
			'Episode 1. Units slotting started.'
		);
	});

	it('mentions the next episode and total count when more episodes remain', () => {
		const t = createGamesTranslator();

		expect(
			formatMissionUpdateMessage(
				buildUpdate({ kind: 'game_started_wait_next_episode', episodeNumber: 1, totalEpisodes: 3 }),
				t
			)
		).toBe('Episode 1. Game started. Please wait until Episode 2 of 3 starts.');
	});

	it('explicitly marks the last episode when the current episode is final', () => {
		const t = createGamesTranslator();

		expect(
			formatMissionUpdateMessage(
				buildUpdate({ kind: 'game_started_wait_next_episode', episodeNumber: 3, totalEpisodes: 3 }),
				t
			)
		).toBe('Episode 3. Game started. This is the last episode.');
	});
});
