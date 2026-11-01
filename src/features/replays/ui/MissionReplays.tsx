'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import type { PublicReplayListItem } from '../domain/api';
import PlayIcon from './PlayIcon';
import { terrainName } from '../domain/terrain';

export default function MissionReplays({ replays }: { replays: PublicReplayListItem[] }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	return (
		<section
			aria-labelledby="mission-replays-title"
			className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6"
		>
			<h2 id="mission-replays-title" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
				{t('publicTitle')}
			</h2>
			<ul className="mt-3 divide-y divide-neutral-800/60">
				{replays.map((replay) => {
					const played =
						replay.startedAt === null
							? null
							: formatLocalizedDateTime(new Date(replay.startedAt * 1000).toISOString(), { locale, timeZone, hourCycle });
					const details = [terrainName(replay.world), played].filter(Boolean).join(' · ');
					return (
						<li key={replay.id}>
							<Link
								href={`/replays/${replay.id}`}
								className="group flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
							>
								<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="whitespace-nowrap rounded-md border border-neutral-700 px-2 py-0.5 text-xs font-bold text-neutral-300 transition group-hover:border-[color:var(--accent)]/60 group-hover:text-[color:var(--accent)]">
										{t('publicEpisode', { episode: replay.episodeNumber })}
									</span>
									{details ? <span className="text-xs font-semibold text-neutral-500">{details}</span> : null}
								</span>
								<span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--accent)]">
									<PlayIcon className="h-4 w-4" />
									{t('publicWatch')}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
