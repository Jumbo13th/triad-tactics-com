'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { StandingsRow } from '../domain/types';
import { fmt1 } from './tableStyles';

const MEDALS: Record<number, string> = {
	1: 'border-[#ffe9a3]/60 bg-gradient-to-b from-[#ffe9a3] via-[#f2c94c] to-[#a8781f] text-[#5c430f] shadow-[0_0_12px_rgba(242,201,76,0.45)] [text-shadow:0_1px_0_rgba(255,255,255,0.45)]',
	2: 'border-[#f1f3f7]/50 bg-gradient-to-b from-[#f1f3f7] via-[#c3c9d4] to-[#7d8590] text-[#3c434d] shadow-[0_0_10px_rgba(195,201,212,0.3)] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]',
	3: 'border-[#e8a36a]/50 bg-gradient-to-b from-[#e8a36a] via-[#cd7f32] to-[#7d4a1c] text-[#4a2c10] shadow-[0_0_10px_rgba(205,127,50,0.3)] [text-shadow:0_1px_0_rgba(255,255,255,0.35)]',
};

export default function TopUnitsWidget({ seasonName, rows }: { seasonName: string; rows: StandingsRow[] }) {
	const t = useTranslations('stats');

	if (rows.length === 0) return null;

	const top = rows.slice(0, 5);
	const maxScore = Math.max(...top.map((row) => row.balanced), 1);

	return (
		<Link
			href="/stats"
			className="group relative block overflow-hidden rounded-2xl border border-[color:var(--accent)]/30 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 transition hover:border-[color:var(--accent)]/60 hover:shadow-[0_0_30px_rgba(210,184,83,0.12)] sm:p-8"
		>
			<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/5 blur-3xl" aria-hidden="true" />

			<div className="relative grid gap-5">
				<div className="flex flex-wrap items-center gap-3">
					<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
						{t('title')}
					</span>
					{seasonName && <span className="text-sm font-semibold text-neutral-400">{t('seasonLabel', { name: seasonName })}</span>}
				</div>

				<h3 className="text-2xl font-semibold tracking-tight text-neutral-50">{t('topUnits')}</h3>

				<ol className="grid gap-2.5">
					{top.map((row) => {
						const medal = MEDALS[row.rank];
						const isFirst = row.rank === 1;
						const barWidth = Math.max(6, Math.round((row.balanced / maxScore) * 100));

						return (
							<li
								key={row.unitId}
								className={`relative overflow-hidden rounded-xl border px-4 transition ${
									isFirst
										? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/[0.06] py-3.5'
										: 'border-white/5 bg-white/[0.03] py-2.5'
								}`}
							>
								<span
									className={`absolute bottom-0 left-0 h-0.5 rounded-full ${isFirst ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--accent)]/40'}`}
									style={{ width: `${barWidth}%` }}
									aria-hidden="true"
								/>

								<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span className="flex min-w-0 flex-1 basis-44 items-center gap-2.5 sm:gap-3">
										{/* SVG numeral centered by construction (dy=0.36em) — HTML line-box metrics never touch it */}
										<span
											className={`relative inline-block shrink-0 select-none rounded-full border ${
												medal ? `h-8 w-8 ${medal}` : 'h-7 w-7 border-white/10 text-neutral-500'
											}`}
										>
											<svg className="absolute inset-0 h-full w-full" viewBox="0 0 32 32" aria-hidden="true">
												<text
													x="16"
													y="16"
													dy="0.36em"
													textAnchor="middle"
													fontSize={medal ? 16 : 13}
													fontWeight={medal ? 900 : 600}
													className="fill-current"
												>
													{row.rank}
												</text>
											</svg>
											<span className="sr-only">{row.rank}</span>
										</span>
										<span
											className={`shrink-0 font-semibold text-[color:var(--accent)] ${isFirst ? 'text-base sm:text-lg' : 'text-sm sm:text-base'}`}
										>
											[{row.unitTag}]
										</span>
										<span
											className={`truncate ${isFirst ? 'text-base text-neutral-100 sm:text-lg' : 'text-sm text-neutral-300'}`}
											title={row.unitName}
										>
											{row.unitName}
										</span>
									</span>
									<span className="ml-auto flex shrink-0 items-baseline gap-2">
										<span className={`font-bold tabular-nums text-[color:var(--accent)] ${isFirst ? 'text-xl sm:text-2xl' : 'text-base'}`}>
											{fmt1(row.balanced)}
										</span>
										<span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
											{t('winsShort', { wins: row.wins })}
										</span>
									</span>
								</span>
							</li>
						);
					})}
				</ol>

				<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] transition group-hover:gap-3">
					{t('viewAll')}
					<svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
						<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
					</svg>
				</div>
			</div>
		</Link>
	);
}
