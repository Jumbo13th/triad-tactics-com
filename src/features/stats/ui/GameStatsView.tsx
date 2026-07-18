'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { GameStatsMeta, GameTimelineEvent, UnitScoreWithUnit } from '../domain/types';
import UnitBreakdownChart from './UnitBreakdownChart';
import { SortHeader, sortRows, useSortState, type SortDir } from './sorting';
import { fmt1, fmtMult, tdNum, tdText } from './tableStyles';

type ScoreSortKey =
	| 'unit'
	| 'kills'
	| 'zoneKills'
	| 'deaths'
	| 'teamkills'
	| 'survivors'
	| 'objectives'
	| 'participants'
	| 'occupancy'
	| 'multiplier'
	| 'final';

const SCORE_DEFAULT_DIR: Record<ScoreSortKey, SortDir> = {
	unit: 'asc',
	kills: 'desc',
	zoneKills: 'desc',
	deaths: 'desc',
	teamkills: 'desc',
	survivors: 'desc',
	objectives: 'desc',
	participants: 'desc',
	occupancy: 'desc',
	multiplier: 'desc',
	final: 'desc',
};

function scoreValueOf(row: UnitScoreWithUnit, key: ScoreSortKey): number | string {
	if (key === 'unit') return row.unitTag.toLowerCase();
	// Side-by-side columns must read additively: «Фраги» shows kills OUTSIDE
	// triggers, «В триггере» the rest; the stored kills stays the total.
	if (key === 'kills') return row.kills - row.zoneKills;
	if (key === 'objectives') return row.objectivePoints;
	if (key === 'occupancy') return row.occupancyPct ?? -1;
	if (key === 'final') return row.finalPoints;
	return row[key];
}

function formatTime(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const mins = Math.floor(total / 60);
	const secs = total % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function GameStatsView({
	meta,
	scores,
	timeline,
	factions,
	sideColors = {},
}: {
	meta: GameStatsMeta;
	scores: UnitScoreWithUnit[];
	timeline: GameTimelineEvent[];
	factions: string[];
	sideColors?: Record<string, string>;
}) {
	const t = useTranslations('stats');
	const { sort, toggle } = useSortState<ScoreSortKey>({ key: 'final', dir: 'desc' }, SCORE_DEFAULT_DIR);

	const sides = factions.length > 0 ? factions : [...new Set(scores.map((s) => s.side))];

	return (
		<section className="grid gap-8">
			<header className="grid gap-2">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
					<Link href="/stats" className="transition hover:text-neutral-300">
						{t('title')}
					</Link>
					{meta.playedAt ? ` — ${meta.playedAt.split(' ')[0]}` : ''}
				</p>
				<h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
					{meta.missionName || t('gameFallbackName', { id: meta.id })}
					{` · E${meta.episodeNumber}`}
				</h1>
				{meta.winnerSide !== '' && (
					<span className="inline-flex w-fit items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
						{meta.winnerSide === 'draw' ? t('resultDraw') : t('resultWinner', { side: meta.winnerSide })}
					</span>
				)}
			</header>

			{scores.length > 0 && (
				<div className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20">
					<p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('breakdownTitle')}</p>
					<UnitBreakdownChart scores={scores} sideColors={sideColors} />
				</div>
			)}

			{sides.map((side) => {
				const sideRows = sortRows(
					scores.filter((row) => row.side === side),
					sort,
					scoreValueOf,
					(a, b) => b.finalPoints - a.finalPoints
				);
				if (sideRows.length === 0) return null;
				const total = sideRows.reduce((sum, row) => sum + row.finalPoints, 0);

				return (
					<div key={side} className="grid gap-3">
						<div className="flex flex-wrap items-center gap-3">
							<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{side}</h2>
							<span className="text-sm font-semibold tabular-nums text-neutral-400">
								{fmt1(total)} {t('pts')}
							</span>
							{meta.winnerSide === side && (
								<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--accent)]">
									{t('victoryBadge')}
								</span>
							)}
						</div>
						<div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm shadow-black/20">
							<table className="w-full min-w-[68rem] border-separate border-spacing-0">
								<thead>
									<tr>
										<SortHeader label={t('colUnit')} sortKey="unit" sort={sort} onToggle={toggle} numeric={false} className="sm:sticky sm:left-0 sm:z-20 sm:bg-neutral-950" />
										<SortHeader label={t('colKills')} sortKey="kills" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colZoneKills')} sortKey="zoneKills" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colDeaths')} sortKey="deaths" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colTeamkills')} sortKey="teamkills" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colSurvivors')} sortKey="survivors" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colObjectives')} sortKey="objectives" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colParticipants')} sortKey="participants" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colOccupancy')} sortKey="occupancy" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colMultiplier')} sortKey="multiplier" sort={sort} onToggle={toggle} />
										<SortHeader label={t('colFinal')} sortKey="final" sort={sort} onToggle={toggle} />
									</tr>
								</thead>
								<tbody>
									{sideRows.map((row) => (
										<tr key={`${row.unitId}|${row.side}`} className="group transition hover:bg-white/[0.03]">
											<td className={`${tdText} transition-colors sm:sticky sm:left-0 sm:z-10 sm:bg-neutral-950 sm:group-hover:bg-neutral-900`}>
												<div className="flex items-baseline gap-1.5">
													<Link
														href={`/units/${row.unitTag}#stats`}
														className="shrink-0 font-semibold hover:opacity-80"
														style={{ color: sideColors[row.side] ?? 'var(--accent)' }}
													>
														[{row.unitTag}]
													</Link>
													<span className="max-w-44 truncate text-neutral-200" title={row.unitName}>
														{row.unitName}
													</span>
													{row.isCommander && (
														<span className="shrink-0 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--accent)]">
															★ {t('commandBadge')}
														</span>
													)}
												</div>
											</td>
											<td className={`${tdNum} text-neutral-200`}>{row.kills - row.zoneKills}</td>
											<td className={`${tdNum} text-neutral-400`}>{row.zoneKills}</td>
											<td className={`${tdNum} text-neutral-400`}>{row.deaths}</td>
											<td className={`${tdNum} text-red-400`}>{row.teamkills}</td>
											<td className={`${tdNum} text-neutral-200`}>{row.survivors}</td>
											<td className={`${tdNum} text-neutral-200`}>{fmt1(row.objectivePoints)}</td>
											<td className={`${tdNum} text-neutral-400`}>{row.participants}</td>
											<td className={`${tdNum} text-neutral-400`}>{row.occupancyPct === null ? '—' : `${row.occupancyPct}%`}</td>
											<td className={`${tdNum} text-neutral-200`}>{fmtMult(row.multiplier)}</td>
											<td className={`${tdNum} font-semibold text-[color:var(--accent)]`}>{fmt1(row.finalPoints)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				);
			})}

			{timeline.length > 0 && (
				<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
					<h2 className="mb-4 text-xl font-semibold tracking-tight text-neutral-50">{t('timeline')}</h2>
					<ul className="grid gap-2 text-sm">
						{timeline.map((event, index) => (
							<li key={index} className="flex gap-4 text-neutral-200">
								<span className="w-12 shrink-0 text-right font-mono text-xs leading-5 text-neutral-500">{formatTime(event.t)}</span>
								<span>
									{event.type === 'capture' && t('eventCapture', { name: event.text })}
									{event.type === 'defense' && t('eventDefense', { name: event.text })}
									{event.type === 'keytarget' && t('eventKeyTarget', { name: event.text })}
									{event.type === 'trigger' && event.text}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
