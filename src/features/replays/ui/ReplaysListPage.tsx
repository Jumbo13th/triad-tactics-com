'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import type { PublicReplayListItem } from '../domain/api';
import { terrainName } from './terrainName';

export default function ReplaysListPage({ replays }: { replays: PublicReplayListItem[] }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	return (
		<section className="grid gap-6">
			<div className="grid gap-2">
				<h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{t('publicTitle')}</h1>
				<p className="text-sm text-neutral-400">{t('publicSubtitle')}</p>
			</div>

			{replays.length === 0 ? (
				<p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-300">{t('publicEmpty')}</p>
			) : (
				<ul className="grid gap-3">
					{replays.map((replay) => {
						const played =
							replay.startedAt === null
								? null
								: formatLocalizedDateTime(new Date(replay.startedAt * 1000).toISOString(), { locale, timeZone, hourCycle });
						const terrain = terrainName(replay.world);
						return (
							<li
								key={replay.id}
								className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20"
							>
								<div className="grid gap-1">
									<p className="text-base font-semibold text-neutral-50">{replay.missionTitle}</p>
									<p className="text-sm text-neutral-400">
										{[t('publicEpisode', { episode: replay.episodeNumber }), terrain, played].filter(Boolean).join(' · ')}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{replay.statsId !== null ? (
										<Link
											href={`/stats/games/${replay.statsId}`}
											locale={locale}
											className="inline-flex items-center rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-neutral-50 hover:bg-white/15"
										>
											{t('publicStats')}
										</Link>
									) : null}
									<Link
										href={`/replays/${replay.id}`}
										locale={locale}
										className="inline-flex items-center rounded-xl bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-neutral-950 hover:opacity-95"
									>
										{t('publicWatch')}
									</Link>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
