'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { UnitHistoryEntry } from '../ports';
import UnitRankChart from './UnitRankChart';
import { SortHeader, sortRows, useSortState, type SortDir } from './sorting';
import { fmt1, fmtMult, tdNum, tdText } from './tableStyles';

type HistorySortKey =
	| 'game'
	| 'kills'
	| 'deaths'
	| 'teamkills'
	| 'survivors'
	| 'participants'
	| 'occupancy'
	| 'multiplier'
	| 'final';

const HISTORY_DEFAULT_DIR: Record<HistorySortKey, SortDir> = {
	game: 'desc',
	kills: 'desc',
	deaths: 'desc',
	teamkills: 'desc',
	survivors: 'desc',
	participants: 'desc',
	occupancy: 'desc',
	multiplier: 'desc',
	final: 'desc',
};

function historyValueOf(entry: UnitHistoryEntry, key: HistorySortKey): number | string {
	if (key === 'game') return entry.game.playedAt || String(entry.game.id);
	if (key === 'occupancy') return entry.score.occupancyPct ?? -1;
	if (key === 'final') return entry.score.finalPoints;
	return entry.score[key];
}

export default function UnitStatsHistory({
	entries,
	seasonRank = null,
	rankSeries = null,
}: {
	entries: UnitHistoryEntry[];
	seasonRank?: { rank: number; total: number } | null;
	rankSeries?: { games: string[]; ranks: number[]; totalUnits: number } | null;
}) {
	const t = useTranslations('stats');
	const { sort, toggle } = useSortState<HistorySortKey>({ key: 'game', dir: 'desc' }, HISTORY_DEFAULT_DIR);
	const sortedEntries = sortRows(entries, sort, historyValueOf, (a, b) => b.game.id - a.game.id);

	const totals = entries.reduce(
		(acc, entry) => {
			acc.points += entry.score.finalPoints;
			acc.kills += entry.score.kills;
			acc.wins += entry.score.isWinnerSide ? 1 : 0;
			acc.commandWins += entry.score.isCommander && entry.score.isWinnerSide ? 1 : 0;
			return acc;
		},
		{ points: 0, kills: 0, wins: 0, commandWins: 0 }
	);

	// Label-over-number tiles: no plural forms needed in any locale.
	const summaryTiles = [
		...(seasonRank ? [{ label: t('statPlace'), value: `${seasonRank.rank}/${seasonRank.total}`, accent: true }] : []),
		{ label: t('colGames'), value: String(entries.length), accent: false },
		{ label: t('statPoints'), value: fmt1(totals.points), accent: true },
		{ label: t('colWins'), value: String(totals.wins), accent: false },
		{ label: t('colCommandWins'), value: String(totals.commandWins), accent: false },
		{ label: t('colKills'), value: String(totals.kills), accent: false },
	];

	return (
		<section
			id="stats"
			className="grid scroll-mt-24 gap-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6"
		>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
					{t('unitHistoryTitle')}
				</p>
				<Link
					href="/stats"
					className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] transition hover:gap-3"
				>
					{t('viewAll')}
					<svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
					</svg>
				</Link>
			</header>

			{entries.length === 0 ? (
				<p className="text-sm text-neutral-400">{t('noGames')}</p>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
						{summaryTiles.map((tile) => (
							<div
								key={tile.label}
								className="flex flex-col rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3"
							>
								<p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-neutral-500">
									{tile.label}
								</p>
								<p
									className={`mt-auto pt-1 text-2xl font-semibold tabular-nums ${
										tile.accent ? 'text-[color:var(--accent)]' : 'text-neutral-50'
									}`}
								>
									{tile.value}
								</p>
							</div>
						))}
					</div>

					{rankSeries && rankSeries.games.length >= 2 && (
						<div className="min-w-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
							<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
								{t('unitRankTitle')}
							</p>
							<UnitRankChart games={rankSeries.games} ranks={rankSeries.ranks} totalUnits={rankSeries.totalUnits} />
						</div>
					)}

					<div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-white/[0.03]">
						<table className="w-full min-w-[56rem] border-separate border-spacing-0">
							<thead>
								<tr>
									<SortHeader label={t('colGame')} sortKey="game" sort={sort} onToggle={toggle} numeric={false} className="sm:sticky sm:left-0 sm:z-20 sm:bg-[#111111]" />
									<SortHeader label={t('colKills')} sortKey="kills" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colDeaths')} sortKey="deaths" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colTeamkills')} sortKey="teamkills" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colSurvivors')} sortKey="survivors" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colParticipants')} sortKey="participants" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colOccupancy')} sortKey="occupancy" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colMultiplier')} sortKey="multiplier" sort={sort} onToggle={toggle} />
									<SortHeader label={t('colFinal')} sortKey="final" sort={sort} onToggle={toggle} />
								</tr>
							</thead>
							<tbody>
								{sortedEntries.map((entry) => (
									<tr key={`${entry.game.id}|${entry.score.side}`} className="group transition hover:bg-white/[0.03]">
										<td className={`${tdText} transition-colors sm:sticky sm:left-0 sm:z-10 sm:bg-[#111111] sm:group-hover:bg-[#1b1b1b]`}>
											<div className="flex items-baseline gap-2">
												<Link
													href={`/stats/games/${entry.game.id}`}
													className="max-w-64 truncate font-semibold text-neutral-100 hover:text-[color:var(--accent)]"
													title={entry.game.missionName}
												>
													{entry.game.missionName || `#${entry.game.id}`}
													{` · E${entry.game.episodeNumber}`}
												</Link>
												{entry.score.isWinnerSide && (
													<span className="shrink-0 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--accent)]">
														{t('victoryBadge')}
													</span>
												)}
												{entry.score.isCommander && <span className="shrink-0 text-xs text-[color:var(--accent)]">★</span>}
											</div>
										</td>
										<td className={`${tdNum} text-neutral-200`}>{entry.score.kills}</td>
										<td className={`${tdNum} text-neutral-400`}>{entry.score.deaths}</td>
										<td className={`${tdNum} text-red-400`}>{entry.score.teamkills}</td>
										<td className={`${tdNum} text-neutral-200`}>{entry.score.survivors}</td>
										<td className={`${tdNum} text-neutral-400`}>{entry.score.participants}</td>
										<td className={`${tdNum} text-neutral-400`}>
											{entry.score.occupancyPct === null ? '—' : `${entry.score.occupancyPct}%`}
										</td>
										<td className={`${tdNum} text-neutral-200`}>{fmtMult(entry.score.multiplier)}</td>
										<td className={`${tdNum} font-semibold text-[color:var(--accent)]`}>{fmt1(entry.score.finalPoints)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</section>
	);
}
