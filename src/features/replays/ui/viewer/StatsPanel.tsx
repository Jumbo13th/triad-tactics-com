'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { ReplayModel } from '../../domain/replayFormat';
import type { ReplayStatsSummary } from '../../domain/statsSummary';
import { DiamondGlyph, Icon } from './glyphs';
import type { SideStyle } from './sideStyle';
import { useDismiss } from './useDismiss';

const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';
const cell = 'px-[6px] py-[5px] text-right tabular-nums';

type Props = {
	stats: ReplayStatsSummary | null;
	model: ReplayModel | null;
	sideStyle: (side: string | null) => SideStyle;
	sideName: (key: string) => string;
	buttonClass: string;
};

/** Side totals read from the recording itself, for a game whose statistics are not out yet. */
function recordingTotals(model: ReplayModel) {
	const sides = new Map(model.sides.map((side) => [side.key, { side: side.key, soldiers: 0, kills: 0, deaths: 0, teamkills: 0 }]));
	for (const entity of model.entities.values()) {
		if (entity.kind === 'man' && entity.side) {
			const side = sides.get(entity.side);
			if (side) side.soldiers++;
		}
	}
	for (const event of model.events) {
		if (event.type !== 'kill') continue;
		const victim = model.entities.get(event.victim);
		if (victim?.kind !== 'man') continue;
		const lost = victim.side ? sides.get(victim.side) : undefined;
		if (lost) lost.deaths++;
		const killer = event.killer !== null && event.killer !== event.victim ? model.entities.get(event.killer) : undefined;
		const scorer = killer?.side ? sides.get(killer.side) : undefined;
		if (!scorer) continue;
		if (event.relation === 'friendly') scorer.teamkills++;
		else if (event.relation === 'enemy') scorer.kills++;
	}
	return [...sides.values()].filter((side) => side.soldiers > 0);
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
	return (
		<table className="w-full table-fixed border-collapse text-[13px] leading-[18px]">
			<thead>
				<tr className="border-b border-[#2c2c2c] text-neutral-400">
					{head.map((label, i) => (
						<th key={label} scope="col" className={`${i === 0 ? 'w-[30%] px-[6px] py-[5px] text-left' : cell} truncate text-[10px] font-semibold uppercase tracking-[0.04em]`}>
							{label}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, r) => (
					<tr key={r} className="border-b border-[#1e1e1e] last:border-0">
						{row.map((value, i) => (
							<td key={i} className={i === 0 ? 'px-[6px] py-[5px] text-left' : `${cell} text-neutral-200`}>
								{value}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export function StatsPanel({ stats, model, sideStyle, sideName, buttonClass }: Props) {
	const t = useTranslations('replayViewer');
	const locale = useLocale();
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, rootRef, close);
	const totals = useMemo(() => (open && !stats && model ? recordingTotals(model) : []), [open, stats, model]);

	const sideLabel = (side: string) => (
		<span className="flex min-w-0 items-center gap-[6px]">
			<DiamondGlyph style={sideStyle(side)} />
			<span className="truncate font-semibold text-neutral-100">{sideName(side)}</span>
		</span>
	);

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={t('statistics')}
				title={t('statistics')}
				className={`${buttonClass} w-auto gap-[6px] px-[8px] text-[13px] font-semibold ${open ? 'bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]' : 'text-neutral-300 hover:bg-[#1a1a1a] hover:text-neutral-100'}`}
			>
				<Icon.Chart size={18} />
				<span className="hidden xl:inline">{t('statistics')}</span>
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label={t('statsTitle')}
					className="fixed inset-x-[8px] top-[54px] z-30 max-h-[calc(100dvh-64px)] overflow-y-auto rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-[6px] sm:w-[420px]"
				>
					<p className={`pb-[8px] text-neutral-400 ${eyebrow}`}>{t('statsTitle')}</p>
					{stats ? (
						<div className="flex flex-col gap-[12px]">
							<p className="flex items-center gap-[8px] text-[15px] font-semibold leading-[20px] text-neutral-100">
								{stats.winnerSide && stats.winnerSide !== 'draw' ? (
									<>
										<DiamondGlyph style={sideStyle(stats.winnerSide)} size={12} />
										{t('statsVictory', { side: sideName(stats.winnerSide) })}
									</>
								) : stats.winnerSide === 'draw' ? (
									t('statsDraw')
								) : (
									<span className="text-neutral-400">{t('statsNoResult')}</span>
								)}
							</p>
							<Table
								head={[t('statsSide'), t('statsPlayers'), t('statsKills'), t('statsLosses'), t('statsPoints')]}
								rows={stats.sides.map((side) => [sideLabel(side.side), side.participants, side.kills, side.deaths, side.points])}
							/>
							{stats.units.length > 0 ? (
								<div className="flex flex-col gap-[4px]">
									<p className={`text-neutral-400 ${eyebrow}`}>{t('statsTopUnits')}</p>
									<ol className="flex flex-col">
										{stats.units.map((unit, i) => (
											<li key={`${unit.unitTag}-${unit.side}`} className="flex min-h-[32px] items-center gap-[8px] border-b border-[#1e1e1e] px-[6px] text-[13px] last:border-0">
												<span className="w-[16px] shrink-0 text-right text-[12px] tabular-nums text-neutral-500">{i + 1}</span>
												<DiamondGlyph style={sideStyle(unit.side)} />
												<span className="min-w-0 flex-1 truncate">
													<span className="font-semibold text-neutral-100">{unit.unitTag}</span>
													<span className="text-neutral-400"> {unit.unitName}</span>
												</span>
												{unit.commander ? <span className={`shrink-0 text-[color:var(--accent)] ${eyebrow}`}>{t('statsCommander')}</span> : null}
												<span className="shrink-0 text-[12px] tabular-nums text-neutral-400">
													{unit.kills}/{unit.deaths}
												</span>
												<span className="w-[40px] shrink-0 text-right font-semibold tabular-nums text-neutral-100">{unit.points}</span>
											</li>
										))}
									</ol>
									{stats.unitCount > stats.units.length ? (
										<p className="px-[6px] text-[12px] text-neutral-500">{t('statsMoreUnits', { count: stats.unitCount - stats.units.length })}</p>
									) : null}
								</div>
							) : null}
							<Link
								href={`/stats/games/${stats.id}`}
								locale={locale}
								className="inline-flex min-h-[40px] items-center justify-center gap-[8px] rounded-[4px] bg-[color:var(--accent)] px-[14px] text-[13px] font-semibold text-[#0a0a0a] hover:bg-[#dcc56c]"
							>
								<Icon.Chart size={16} />
								{t('statsOpenFull')}
							</Link>
						</div>
					) : (
						<div className="flex flex-col gap-[10px]">
							<p className="text-[13px] leading-[18px] text-neutral-300">{t('statsNotPublished')}</p>
							{totals.length > 0 ? (
								<Table
									head={[t('statsSide'), t('statsSoldiers'), t('statsKills'), t('statsLosses'), t('statsTeamkills')]}
									rows={totals.map((side) => [sideLabel(side.side), side.soldiers, side.kills, side.deaths, side.teamkills])}
								/>
							) : null}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
