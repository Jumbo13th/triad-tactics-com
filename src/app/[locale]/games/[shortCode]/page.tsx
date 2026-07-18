export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import GameMissionPage from '@/features/games/ui/GameMissionPage';
import { statsDeps } from '@/features/stats/deps';
import { getGameByShortCodeDeps } from '@/features/games/deps';
import { getGameByShortCode } from '@/features/games/useCases/getGameByShortCode';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';

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

	const missionId = statsDeps.repo.findMissionIdByShortCode(trimmedShortCode);
	const statsEpisodes = missionId
		? statsDeps.repo.listGamesForMission(missionId).filter((game) => game.status === 'published')
		: [];
	const tStats = await getTranslations('stats');

	const statsSlot =
		statsEpisodes.length > 0 ? (
			<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{tStats('title')}</p>
				<ul className="mt-3 divide-y divide-neutral-800/60">
					{statsEpisodes.map((game) => (
						<li key={game.id}>
							<Link
								href={`/stats/games/${game.id}`}
								className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5"
							>
								<span className="flex items-center gap-3">
									<span className="whitespace-nowrap rounded-md border border-neutral-700 px-2 py-0.5 text-xs font-bold text-neutral-300 transition group-hover:border-[color:var(--accent)]/60 group-hover:text-[color:var(--accent)]">
										{tStats('epLabel', { n: game.episodeNumber })}
									</span>
									{game.winnerSide && game.winnerSide !== 'draw' && (
										<span className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--accent)]">
											{tStats('resultWinner', { side: game.winnerSide })}
										</span>
									)}
									{game.winnerSide === 'draw' && (
										<span className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
											{tStats('resultDrawShort')}
										</span>
									)}
								</span>
								<span className="text-xs font-semibold text-neutral-500">{game.playedAt.split(' ')[0]}</span>
							</Link>
						</li>
					))}
				</ul>
			</section>
		) : null;

	return <GameMissionPage mission={mission.mission} statsSlot={statsSlot} />;
}
