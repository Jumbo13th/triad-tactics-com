'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Season, StandingsRow } from '../domain/types';
import type { LandingMissionGroup } from '../useCases/getStatsLanding';
import { StandingsChart } from './charts';
import RaceBumpChart, { type RaceSeries } from './RaceBumpChart';
import ScoreFormula from './ScoreFormula';
import { SortHeader, sortRows, useSortState, type SortDir } from './sorting';
import { fmt1, tdNum, tdText } from './tableStyles';

type SortKey =
	| 'rank'
	| 'unit'
	| 'balanced'
	| 'rawPoints'
	| 'perCapita'
	| 'games'
	| 'wins'
	| 'commandWins'
	| 'kills'
	| 'deaths'
	| 'teamkills'
	| 'avgParticipants';

// Structural mirror of rotation's RotationSideInfo — no cross-feature import;
// the app route composes the two features.
type SideInfo = { sideName: string; sideColor: string };

const DEFAULT_DIR: Record<SortKey, SortDir> = {
	rank: 'asc',
	unit: 'asc',
	balanced: 'desc',
	rawPoints: 'desc',
	perCapita: 'desc',
	games: 'desc',
	wins: 'desc',
	commandWins: 'desc',
	kills: 'desc',
	deaths: 'desc',
	teamkills: 'desc',
	avgParticipants: 'desc',
};

function valueOf(row: StandingsRow, key: SortKey): number | string {
	if (key === 'unit') return row.unitTag.toLowerCase();
	return row[key];
}

export default function StatsSection({
	season,
	seasons,
	rows,
	missionGroups,
	gamesPage = 1,
	gamesTotalPages = 1,
	rotationSides = {},
	race = null,
	sideWins = null,
}: {
	season: Season | null;
	seasons: Season[];
	rows: StandingsRow[];
	missionGroups: LandingMissionGroup[];
	gamesPage?: number;
	gamesTotalPages?: number;
	rotationSides?: Record<number, SideInfo>;
	race?: { games: string[]; series: RaceSeries[] } | null;
	sideWins?: { sides: { side: string; wins: number; color: string | null }[]; draws: number } | null;
}) {
	const t = useTranslations('stats');
	const { sort, toggle: toggleSort } = useSortState<SortKey>({ key: 'rank', dir: 'asc' }, DEFAULT_DIR);
	const sortedRows = sortRows(rows, sort, valueOf, (a, b) => a.rank - b.rank);

	const [raceFullscreen, setRaceFullscreen] = useState(false);
	const [raceRow, setRaceRow] = useState(34);
	useEffect(() => {
		if (!raceFullscreen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setRaceFullscreen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [raceFullscreen]);

	function openRaceFullscreen() {
		const units = race ? race.series.length : 0;
		if (units > 1) {
			setRaceRow(Math.max(34, Math.min(60, Math.floor((window.innerHeight - 220) / (units - 1)))));
		}
		setRaceFullscreen(true);
	}

	const chartData = rows.slice(0, 10).map((row) => ({ name: row.unitTag, score: row.balanced }));

	const sideLegend = useMemo(() => {
		const seen = new Map<string, SideInfo>();
		for (const side of Object.values(rotationSides)) {
			if (!seen.has(side.sideName)) seen.set(side.sideName, side);
		}
		return [...seen.values()];
	}, [rotationSides]);

	return (
		<section className="grid gap-8">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div className="grid gap-2">
					<span className="inline-flex w-fit items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
						{season ? t('seasonLabel', { name: season.name }) : t('allTime')}
					</span>
					<h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">{t('title')}</h1>
				</div>
				{seasons.length > 1 && (
					<nav className="flex flex-wrap gap-2 text-xs font-semibold">
						{seasons.map((s) => (
							<Link
								key={s.id}
								href={`/stats?season=${s.id}`}
								className={`inline-flex items-center rounded-full border px-3 py-1 transition ${
									season?.id === s.id
										? 'border-[color:var(--accent)]/60 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
										: 'border-neutral-800 bg-neutral-950/80 text-neutral-300 hover:border-neutral-600'
								}`}
							>
								{s.name}
							</Link>
						))}
					</nav>
				)}
			</header>

			{rows.length === 0 ? (
				<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400 shadow-sm shadow-black/20 sm:p-8">
					{t('leaderboardEmpty')}
				</div>
			) : (
				<>
					{sideWins && sideWins.sides.length > 0 && (
						<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20">
							<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('sideScoreTitle')}</p>
							{sideWins.sides.length === 2 ? (
								<div className="mt-3 grid gap-2">
									<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
										<span className="inline-flex items-center justify-end gap-2 text-right text-xs font-semibold uppercase tracking-[0.15em] text-neutral-300 sm:text-sm sm:tracking-[0.2em]">
											{sideWins.sides[0].color && (
												<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sideWins.sides[0].color }} />
											)}
											{sideWins.sides[0].side}
										</span>
										<span className="text-3xl font-bold tabular-nums text-neutral-50 sm:text-4xl">
											{sideWins.sides[0].wins}
											<span className="mx-2 text-neutral-600 sm:mx-3">:</span>
											{sideWins.sides[1].wins}
										</span>
										<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-300 sm:text-sm sm:tracking-[0.2em]">
											{sideWins.sides[1].side}
											{sideWins.sides[1].color && (
												<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sideWins.sides[1].color }} />
											)}
										</span>
									</div>
									{sideWins.draws > 0 && (
										<span className="text-center text-xs text-neutral-500">+{sideWins.draws} {t('drawsLabel')}</span>
									)}
								</div>
							) : (
								<div className="mt-3 flex flex-wrap items-center gap-3">
									{sideWins.sides.map((entry) => (
										<span
											key={entry.side}
											className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-white/[0.03] px-4 py-1.5"
										>
											{entry.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />}
											<span className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-300">{entry.side}</span>
											<span className="text-lg font-bold tabular-nums text-neutral-50">{entry.wins}</span>
										</span>
									))}
									{sideWins.draws > 0 && (
										<span className="text-xs text-neutral-500">+{sideWins.draws} {t('drawsLabel')}</span>
									)}
								</div>
							)}
						</div>
					)}

					<div className="grid gap-2">
						{sideLegend.length > 0 && (
							<div className="flex flex-wrap justify-end gap-4 text-xs font-semibold text-neutral-400">
								{sideLegend.map((side) => (
									<span key={side.sideName} className="inline-flex items-center gap-1.5">
										<span className="h-2 w-2 rounded-full" style={{ backgroundColor: side.sideColor }} />
										{side.sideName}
									</span>
								))}
							</div>
						)}
					<div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm shadow-black/20">
						<table className="w-full min-w-[64rem] border-separate border-spacing-0">
							<thead>
								<tr>
									<SortHeader label="#" sortKey="rank" sort={sort} onToggle={toggleSort} className="w-12 sm:sticky sm:left-0 sm:z-20 sm:bg-neutral-950" />
									<SortHeader label={t('colUnit')} sortKey="unit" sort={sort} onToggle={toggleSort} numeric={false} className="sm:sticky sm:left-12 sm:z-20 sm:bg-neutral-950" />
									<SortHeader label={t('colScore')} sortKey="balanced" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colRaw')} sortKey="rawPoints" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colPerCapita')} sortKey="perCapita" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colGames')} sortKey="games" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colWins')} sortKey="wins" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colCommandWins')} sortKey="commandWins" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colKills')} sortKey="kills" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colDeaths')} sortKey="deaths" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colTeamkills')} sortKey="teamkills" sort={sort} onToggle={toggleSort} />
									<SortHeader label={t('colAvgPlayers')} sortKey="avgParticipants" sort={sort} onToggle={toggleSort} />
								</tr>
							</thead>
							<tbody>
								{sortedRows.map((row) => {
									const side = rotationSides[row.unitId];
									return (
									<tr key={row.unitId} className="group transition hover:bg-white/[0.03]">
										<td
											className={`${tdNum} w-12 text-neutral-500 transition-colors sm:sticky sm:left-0 sm:z-10 sm:bg-neutral-950 sm:group-hover:bg-neutral-900`}
											style={side ? { boxShadow: `inset 3px 0 0 0 ${side.sideColor}` } : undefined}
										>
											{row.rank}
										</td>
										<td className={`${tdText} transition-colors sm:sticky sm:left-12 sm:z-10 sm:bg-neutral-950 sm:group-hover:bg-neutral-900`}>
											<div className="flex items-baseline gap-1.5">
												{side && (
													<span
														className="h-2 w-2 shrink-0 self-center rounded-full"
														style={{ backgroundColor: side.sideColor }}
														title={side.sideName}
													/>
												)}
												<Link href={`/units/${row.unitTag}#stats`} className="shrink-0 font-semibold text-[color:var(--accent)] hover:opacity-80">
													[{row.unitTag}]
												</Link>
												<span className="max-w-52 truncate text-neutral-200" title={row.unitName}>
													{row.unitName}
												</span>
											</div>
										</td>
										<td className={`${tdNum} font-semibold text-[color:var(--accent)]`}>{fmt1(row.balanced)}</td>
										<td className={`${tdNum} text-neutral-200`}>{fmt1(row.rawPoints)}</td>
										<td className={`${tdNum} text-neutral-400`}>{fmt1(row.perCapita)}</td>
										<td className={`${tdNum} text-neutral-200`}>{row.games}</td>
										<td className={`${tdNum} text-neutral-200`}>{row.wins}</td>
										<td className={`${tdNum} text-neutral-200`}>{row.commandWins}</td>
										<td className={`${tdNum} text-neutral-200`}>{row.kills}</td>
										<td className={`${tdNum} text-neutral-400`}>{row.deaths}</td>
										<td className={`${tdNum} text-red-400`}>{row.teamkills}</td>
										<td className={`${tdNum} text-neutral-400`}>{fmt1(row.avgParticipants)}</td>
									</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					</div>

					{/* min-w-0 overflow-hidden: else the grid item grows to the chart's fixed width and the PAGE scrolls */}
					<div className="min-w-0 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20">
						<div className="mb-4 flex items-start justify-between gap-3">
							<div className="grid gap-1">
								<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('raceTitle')}</p>
								<p className="text-xs text-neutral-500">{t('raceLegend')}</p>
							</div>
							{race && race.games.length >= 1 && (
								<button
									type="button"
									onClick={openRaceFullscreen}
									title={t('raceFullscreen')}
									aria-label={t('raceFullscreen')}
									className="rounded-lg border border-neutral-700 bg-white/5 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-neutral-100"
								>
									<svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15m-11.25 5.25v-4.5m0 4.5h4.5m-4.5 0L9 15" />
									</svg>
								</button>
							)}
						</div>
						{race && race.games.length >= 1 ? (
							<RaceBumpChart games={race.games} series={race.series} />
						) : (
							<StandingsChart data={chartData} label={t('colScore')} />
						)}
					</div>

					{raceFullscreen && race && race.games.length >= 1 && (
						<div className="fixed inset-0 z-[100] overflow-y-auto bg-neutral-950 p-4 sm:p-8">
							<div className="mb-6 flex items-start justify-between gap-3">
								<div className="grid gap-1">
									<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('raceTitle')}</p>
									<p className="text-xs text-neutral-500">{t('raceLegend')}</p>
								</div>
								<button
									type="button"
									onClick={() => setRaceFullscreen(false)}
									title={t('raceClose')}
									aria-label={t('raceClose')}
									className="rounded-lg border border-neutral-700 bg-white/5 p-2 text-neutral-300 transition hover:bg-white/10 hover:text-neutral-100"
								>
									<svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
							<RaceBumpChart games={race.games} series={race.series} row={raceRow} />
						</div>
					)}

					<ScoreFormula rows={rows} />
				</>
			)}

			<div className="grid gap-3">
				<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{t('recentGames')}</h2>
				{missionGroups.length === 0 ? (
					<p className="text-sm text-neutral-400">{t('noGames')}</p>
				) : (
					<>
					<ul className="grid gap-3">
						{missionGroups.map((mission) => (
							<li key={mission.missionId}>
								<div className="grid gap-1 rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 shadow-sm shadow-black/20">
									<p className="font-semibold leading-snug text-neutral-100">
										{mission.missionName || t('gameFallbackName', { id: mission.missionId })}
									</p>
									<ul className="divide-y divide-neutral-800/60">
										{mission.episodes.map((game) => {
											const winner = game.sides.find((side) => side.isWinner) ?? null;
											return (
												<li key={game.id}>
													<Link
														href={`/stats/games/${game.id}`}
														className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5"
													>
														<span className="flex items-center gap-3">
															<span className="whitespace-nowrap rounded-md border border-neutral-700 px-2 py-0.5 text-xs font-bold text-neutral-300 transition group-hover:border-[color:var(--accent)]/60 group-hover:text-[color:var(--accent)]">
																{t('epLabel', { n: game.episodeNumber })}
															</span>
															{game.winnerSide === 'draw' ? (
																<span className="inline-flex items-center rounded-full border border-neutral-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
																	{t('resultDrawShort')}
																</span>
															) : winner ? (
																<span
																	className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]"
																	style={{
																		borderColor: winner.color ? `${winner.color}55` : '#3f3f3f',
																		backgroundColor: winner.color ? `${winner.color}1a` : 'transparent',
																		color: winner.color ?? '#a3a3a3',
																	}}
																>
																	{winner.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: winner.color }} />}
																	{t('resultWinner', { side: winner.name })}
																</span>
															) : null}
														</span>
														<span className="flex items-baseline gap-4">
															{game.sides.length === 2 && (
																<span className="inline-flex items-baseline gap-2 text-sm font-semibold tabular-nums" title={t('colParticipants')}>
																	<span className="text-xs uppercase text-neutral-500">{game.sides[0].name}</span>
																	<span style={{ color: game.sides[0].color ?? '#d4d4d4' }}>{game.sides[0].participants}</span>
																	<span className="text-neutral-600">:</span>
																	<span style={{ color: game.sides[1].color ?? '#d4d4d4' }}>{game.sides[1].participants}</span>
																	<span className="text-xs uppercase text-neutral-500">{game.sides[1].name}</span>
																</span>
															)}
															<span className="text-xs font-semibold text-neutral-500">{game.playedAt.split(' ')[0]}</span>
														</span>
													</Link>
												</li>
											);
										})}
									</ul>
								</div>
							</li>
						))}
					</ul>
					{gamesTotalPages > 1 && (
						<nav className="flex items-center justify-center gap-4 pt-1 text-sm font-semibold">
							{gamesPage > 1 ? (
								<Link
									href={`/stats?${season ? `season=${season.id}&` : ''}page=${gamesPage - 1}`}
									className="rounded-lg border border-neutral-700 bg-white/5 px-4 py-1.5 text-neutral-200 transition hover:bg-white/10"
								>
									{t('pagerPrev')}
								</Link>
							) : (
								<span className="rounded-lg border border-neutral-800 px-4 py-1.5 text-neutral-600">{t('pagerPrev')}</span>
							)}
							<span className="tabular-nums text-neutral-400">
								{gamesPage} / {gamesTotalPages}
							</span>
							{gamesPage < gamesTotalPages ? (
								<Link
									href={`/stats?${season ? `season=${season.id}&` : ''}page=${gamesPage + 1}`}
									className="rounded-lg border border-neutral-700 bg-white/5 px-4 py-1.5 text-neutral-200 transition hover:bg-white/10"
								>
									{t('pagerNext')}
								</Link>
							) : (
								<span className="rounded-lg border border-neutral-800 px-4 py-1.5 text-neutral-600">{t('pagerNext')}</span>
							)}
						</nav>
					)}
					</>
				)}
			</div>
		</section>
	);
}
