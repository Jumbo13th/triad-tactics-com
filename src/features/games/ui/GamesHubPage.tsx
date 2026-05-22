'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CurrentGameSummary, GameArchiveResult, GameArchiveSummary } from '@/features/games/domain/types';
import type { Rotation } from '@/features/rotation/domain/types';
import type { AppLocale } from '@/i18n/locales';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { formatViewerDate } from './missionPageUtils';
import CurrentGameMissionCard from './CurrentGameMissionCard';
import { RotationSection } from '@/features/rotation/ui/root';

type Props = {
	current: CurrentGameSummary | null;
	archive: GameArchiveSummary[];
	rotation: Rotation;
};

function renderArchiveResult(result: GameArchiveResult | null, t: ReturnType<typeof useTranslations<'games'>>): string {
	if (!result) return t('archiveNoResult');
	if (result.outcome === 'draw') return t('archiveResultDraw');
	if (!result.winnerSideId) return t('archiveNoResult');
	const winner = result.sideScores.find((s) => s.sideId === result.winnerSideId);
	return t('archiveResultWinner', { side: winner?.sideName ?? result.winnerSideId });
}

function renderArchiveScores(result: GameArchiveResult | null): string | null {
	if (!result || result.sideScores.length === 0) return null;
	return result.sideScores.map((score) => `${score.sideName} ${score.score}`).join(' / ');
}

export default function GamesHubPage({ current, archive, rotation }: Props) {
	const t = useTranslations('games');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	return (
		<section className="grid gap-6">
			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{t('hubEyebrow')}</p>
				<h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{t('hubTitle')}</h2>
				<p className="mt-2 max-w-2xl text-sm text-neutral-300 sm:text-base">{t('hubSubtitle')}</p>
			</div>

			{current ? (
				<CurrentGameMissionCard current={current} />
			) : (
				<div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/70 p-5 shadow-sm shadow-black/20 sm:p-8">
					<h3 className="text-xl font-semibold tracking-tight text-neutral-50">{t('noCurrentTitle')}</h3>
					<p className="mt-2 max-w-2xl text-sm text-neutral-300 sm:text-base">{t('noCurrentText')}</p>
				</div>
			)}

			<RotationSection rotation={rotation} />

			<details className="group rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm shadow-black/20">
				<summary className="flex cursor-pointer list-none items-center justify-between p-5 sm:p-8 [&::-webkit-details-marker]:hidden">
					<div className="space-y-2">
						<h3 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('archiveTitle')}</h3>
						<p className="text-sm text-neutral-300 sm:text-base">{t('archiveSubtitle')}</p>
					</div>
					<svg
						className="ml-3 h-5 w-5 shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2}
						stroke="currentColor"
						aria-hidden="true"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
					</svg>
				</summary>

				<div className="px-5 pb-5 sm:px-8 sm:pb-8">
				{archive.length === 0 ? (
					<p className="text-sm text-neutral-400">{t('archiveEmpty')}</p>
				) : (
					<div className="grid gap-3">
						{archive.map((mission) => {
							const startsAt = formatViewerDate(mission.startsAt, locale, timeZone, hourCycle);
							const archivedAt = formatViewerDate(mission.archivedAt, locale, timeZone, hourCycle);
							const scoreLine = renderArchiveScores(mission.archiveResult);
							return (
								<Link
									key={mission.shortCode}
									href={`/games/${mission.shortCode}`}
									className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-[color:var(--accent)]/35 hover:bg-white/[0.03]"
								>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<h4 className="text-lg font-semibold tracking-tight text-neutral-50">{mission.title}</h4>
												<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-300">

													{mission.archiveStatus === 'completed' ? t('completedBadge') : t('canceledBadge')}
												</span>
											</div>
											<p className="mt-2 text-sm text-neutral-300">{(mission.description[locale as AppLocale] || mission.description.en) || t('archiveDescriptionFallback')}</p>
										</div>
										<div className="text-sm text-neutral-400">
											<div>{startsAt ? `${t('startsAtLabel')}: ${startsAt}` : null}</div>
											<div>{archivedAt ? `${t('archivedAtLabel')}: ${archivedAt}` : null}</div>
										</div>
									</div>

									<div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-neutral-300">
										<span>{t('archiveResultLabel')}: {renderArchiveResult(mission.archiveResult, t)}</span>
										{scoreLine ? <span>{t('archiveScoresLabel')}: {scoreLine}</span> : null}
										{mission.archiveStatus === 'canceled' && mission.archiveReason ? (
											<span>{t('archiveReasonLabel')}: {mission.archiveReason}</span>
										) : null}
									</div>
								</Link>
							);
						})}
					</div>
				)}
				</div>
			</details>
		</section>
	);
}
