'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import ChartIcon from './ChartIcon';
import PlayIcon from './PlayIcon';
import { terrainName } from '../domain/terrain';

/** One episode of a mission with whatever it has published: its statistics, its replay, or both. */
export type MissionEpisode = {
	episodeNumber: number;
	statsId: number | null;
	/** '' or null when no result was declared, 'draw' for a draw. */
	winnerSide: string | null;
	replayId: number | null;
	world: string | null;
	/** UTC Unix seconds the replay started; null without a replay. */
	startedAt: number | null;
	/** The statistics' own date, used when there is no replay to date the episode. */
	playedOn: string | null;
};

const ACTION =
	'inline-flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';

export default function MissionEpisodes({ episodes }: { episodes: MissionEpisode[] }) {
	const t = useTranslations('replays');
	const tStats = useTranslations('stats');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	return (
		<section
			aria-labelledby="mission-episodes-title"
			className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6"
		>
			<h2 id="mission-episodes-title" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
				{t('missionEpisodes')}
			</h2>
			<ul className="mt-3 divide-y divide-neutral-800/60">
				{episodes.map((episode) => {
					const played =
						episode.startedAt !== null
							? formatLocalizedDateTime(new Date(episode.startedAt * 1000).toISOString(), { locale, timeZone, hourCycle })
							: episode.playedOn;
					const details = [terrainName(episode.world), played].filter(Boolean).join(' · ');
					const result =
						episode.winnerSide === 'draw'
							? tStats('resultDrawShort')
							: episode.winnerSide
								? tStats('resultWinner', { side: episode.winnerSide })
								: null;
					return (
						<li key={episode.episodeNumber} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
							<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span className="whitespace-nowrap rounded-md border border-neutral-700 px-2 py-0.5 text-xs font-bold text-neutral-300">
									{t('publicEpisode', { episode: episode.episodeNumber })}
								</span>
								{result ? (
									<span className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--accent)]">{result}</span>
								) : null}
								{details ? <span className="text-xs font-semibold text-neutral-500">{details}</span> : null}
							</span>
							<span className="flex items-center gap-1">
								{episode.statsId !== null ? (
									<Link href={`/stats/games/${episode.statsId}`} className={`${ACTION} text-neutral-300 hover:bg-white/5 hover:text-neutral-50`}>
										<span className="flex text-neutral-500">
											<ChartIcon />
										</span>
										{t('publicStats')}
									</Link>
								) : null}
								{episode.replayId !== null ? (
									<Link href={`/replays/${episode.replayId}`} className={`${ACTION} text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10`}>
										<PlayIcon className="h-4 w-4" />
										{t('publicWatch')}
									</Link>
								) : null}
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
