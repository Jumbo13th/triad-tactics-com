export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import GameMissionPage from '@/features/games/ui/GameMissionPage';
import { statsDeps } from '@/features/stats/deps';
import { getPublishedEpisodesForMission } from '@/features/stats/useCases/getPublishedEpisodesForMission';
import { getGameByShortCodeDeps } from '@/features/games/deps';
import { getGameByShortCode } from '@/features/games/useCases/getGameByShortCode';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { publicReplaysDeps } from '@/features/replays/deps';
import { listMissionReplays } from '@/features/replays/useCases/findEpisodeReplays';
import { MissionEpisodes } from '@/features/replays/ui/root';

export default async function GameMissionRoutePage({
	params
}: {
	params: Promise<{ locale: string; shortCode: string }>;
}) {
	const { locale, shortCode } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);
	if (!status.connected) redirect(`/${locale}/apply`);

	const trimmedShortCode = shortCode.trim();
	if (!trimmedShortCode) {
		notFound();
	}

	const mission = getGameByShortCode(getGameByShortCodeDeps, {
		shortCode: trimmedShortCode,
		steamId64: status.steamid64
	});

	if (!mission.ok) {
		if (mission.error === 'not_found') {
			notFound();
		}
		throw new Error('game_mission_page_load_failed');
	}

	const statsEpisodes = getPublishedEpisodesForMission(statsDeps, { shortCode: trimmedShortCode });
	const replays = listMissionReplays(publicReplaysDeps, { shortCode: trimmedShortCode });

	return (
		<GameMissionPage
			mission={mission.mission}
			statsSlot={statsEpisodes.length + replays.length > 0 ? <MissionEpisodes stats={statsEpisodes} replays={replays} /> : null}
		/>
	);
}
