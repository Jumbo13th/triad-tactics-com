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
	const sides = new Map(model.sides.map((side) => [side.key, { side: side.key, players: 0, fielded: false, kills: 0, deaths: 0, teamkills: 0 }]));
	for (const entity of model.entities.values()) {
		const side = entity.kind === 'man' && entity.side ? sides.get(entity.side) : undefined;
		if (side) side.fielded = true;
	}
	// A player counts once for each side whose soldiers they played, however many bodies.
	for (const player of model.players.values()) {
		const played = new Set<string>();
		for (const change of player.controls) {
			const body = change.value !== null ? model.entities.get(change.value) : undefined;
			if (body?.kind === 'man' && body.side) played.add(body.side);
		}
		for (const key of played) {
			const side = sides.get(key);
			if (side) side.players++;
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
	return [...sides.values()].filter((side) => side.fielded);
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
	return (
		<table className="w-full table-fixed border-collapse text-[13px] leading-[18px]">
			<thead>
				<tr className="border-b border-[#2c2c2c] text-neutral-400">
					{head.map((label, i) => (
						<th key={label} scope="col" className={`${i === 0 ? 'w-[24%] px-[6px] py-[5px] text-left' : cell} hyphens-auto align-bottom text-[10px] font-semibold uppercase leading-[12px] tracking-[0.04em]`}>
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

/** Every unit under its side, as the statistics page lays them out, each side closed by its total. */
function StatsSheet({ stats, sideStyle, sideName }: { stats: ReplayStatsSummary } & Pick<Props, 'sideStyle' | 'sideName'>) {
	const t = useTranslations('replayViewer');
	const locale = useLocale();
	const tenths = (value: number) => value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const count = (value: number) => <span className={value === 0 ? 'text-neutral-500' : undefined}>{value}</span>;
	// Kills outside the zone and in it are counted apart, as on the statistics page.
	const figures = (row: ReplayStatsSummary['sides'][number] | ReplayStatsSummary['units'][number]) => [
		count(row.participants),
		count(row.kills - row.zoneKills),
		count(row.zoneKills),
		<span key="tk" className={row.teamkills > 0 ? 'text-red-300' : 'text-neutral-500'}>{row.teamkills}</span>,
		count(row.deaths),
		row.objectivePoints > 0 ? tenths(row.objectivePoints) : <span className="text-neutral-500">{tenths(0)}</span>,
		<span key="pts" className="font-semibold text-neutral-100">{tenths(row.points)}</span>,
	];
	const head = [t('statsUnit'), t('statsPlayers'), t('statsKills'), t('statsInTrigger'), t('statsTeamkills'), t('statsLosses'), t('statsObjectives'), t('statsPoints')];

	return (
		<div className="-mx-[6px] overflow-x-auto px-[6px]">
			<table className="w-full min-w-[580px] table-fixed border-collapse text-[13px] leading-[18px]">
				<thead>
					<tr className="border-b border-[#2c2c2c] text-neutral-400">
						{head.map((label, i) => (
							<th key={label} scope="col" className={`${i === 0 ? 'w-[25%] px-[6px] py-[5px] text-left' : cell} hyphens-auto align-bottom text-[10px] font-semibold uppercase leading-[12px] tracking-[0.04em]`}>
								{label}
							</th>
						))}
					</tr>
				</thead>
				{stats.sides.map((side) => (
					<tbody key={side.side}>
						<tr>
							<th scope="rowgroup" colSpan={head.length} className="px-[6px] pb-[4px] pt-[12px] text-left font-normal">
								<span className="flex items-center gap-[8px]">
									<DiamondGlyph style={sideStyle(side.side)} />
									<span className="font-semibold text-neutral-100">{sideName(side.side)}</span>
									{stats.winnerSide === side.side ? <span className={`text-[color:var(--accent)] ${eyebrow}`}>{t('statsWinner')}</span> : null}
								</span>
							</th>
						</tr>
						{stats.units
							.filter((unit) => unit.side === side.side)
							.map((unit) => (
								<tr key={unit.unitTag} className="border-t border-[#1e1e1e]">
									<td className="px-[6px] py-[5px] text-left">
										<span className="flex min-w-0 items-center gap-[6px]">
											<span className="font-semibold text-neutral-100">{unit.unitTag}</span>
											<span className="min-w-0 truncate text-neutral-400">{unit.unitName}</span>
											{unit.commander ? (
												<span title={t('statsCommander')} className="shrink-0 text-[color:var(--accent)]">
													★<span className="sr-only">{t('statsCommander')}</span>
												</span>
											) : null}
										</span>
									</td>
									{figures(unit).map((value, i) => (
										<td key={i} className={`${cell} text-neutral-200`}>
											{value}
										</td>
									))}
								</tr>
							))}
						<tr className="border-t border-[#2c2c2c] font-semibold">
							<td className="px-[6px] py-[5px] text-left text-neutral-400">{t('statsTotal')}</td>
							{figures(side).map((value, i) => (
								<td key={i} className={`${cell} text-neutral-100`}>
									{value}
								</td>
							))}
						</tr>
					</tbody>
				))}
			</table>
		</div>
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
					className="fixed inset-x-[8px] top-[56px] z-30 max-h-[calc(100dvh-64px)] overflow-y-auto rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-[14px] sm:w-[640px]"
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
							<StatsSheet stats={stats} sideStyle={sideStyle} sideName={sideName} />
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
									head={[t('statsSide'), t('statsPlayers'), t('statsKills'), t('statsLosses'), t('statsTeamkills')]}
									rows={totals.map((side) => [sideLabel(side.side), side.players, side.kills, side.deaths, side.teamkills])}
								/>
							) : null}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
