'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StandingsRow } from '../domain/types';
import { fmt1 } from './tableStyles';

function PriceRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'gold' | 'red' | 'muted' }) {
	const valueColor =
		tone === 'gold'
			? 'text-[color:var(--accent)]'
			: tone === 'red'
				? 'text-red-400'
				: tone === 'muted'
					? 'font-normal italic text-neutral-500'
					: 'text-neutral-50';
	return (
		<div className="flex items-end gap-3 py-1">
			<span className="text-sm text-neutral-300">{label}</span>
			{/* items-end + mb nudge keeps the dotted leader on the LAST line of wrapped text */}
			<span className="mb-1.5 min-w-8 flex-1 border-b border-dotted border-neutral-800" aria-hidden="true" />
			<span className={`max-w-[55%] text-right text-sm font-bold tabular-nums ${valueColor}`}>{value}</span>
		</div>
	);
}

function LabeledNum({ value, label, accent = false, big = false }: { value: string; label: string; accent?: boolean; big?: boolean }) {
	const size = big ? (accent ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl') : accent ? 'text-3xl' : 'text-2xl';
	return (
		<span className="inline-flex items-baseline gap-2 whitespace-nowrap">
			<span className={`tabular-nums font-bold ${size} ${accent ? 'text-[color:var(--accent)]' : 'text-neutral-100'}`}>
				{value}
			</span>
			<span className={`lowercase ${big ? 'text-sm' : 'text-xs'} ${accent ? 'text-[color:var(--accent)]/70' : 'text-neutral-500'}`}>{label}</span>
		</span>
	);
}

export default function ScoreFormula({ rows }: { rows: StandingsRow[] }) {
	const t = useTranslations('stats');
	const [unitId, setUnitId] = useState<number | null>(null);

	const selected = rows.find((row) => row.unitId === unitId) ?? rows[0];

	return (
		<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
			<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('formulaTitle')}</p>

			<div className="mt-5 grid gap-6 sm:grid-cols-2">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('fPoints')}</p>
					<div className="mt-2">
						<PriceRow label={t('priceKill')} value="+1" />
						<PriceRow label={t('priceZoneKill')} value="+2" tone="gold" />
						<PriceRow label={t('priceTeamkill')} value="−2" tone="red" />
						<PriceRow label={t('priceSurvivor')} value="+1" />
						<PriceRow label={t('priceZoneObjective')} value={t('valMissionPoints')} tone="muted" />
						<PriceRow label={t('priceKeyTarget')} value={t('valMissionPoints')} tone="muted" />
					</div>
				</div>
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('coefTitle')}</p>
					<div className="mt-2">
						<PriceRow label={t('priceWin')} value="×1.25" tone="gold" />
						<PriceRow label={t('priceCommand')} value="×1.5" tone="gold" />
					</div>
				</div>
			</div>

			{selected && (
				<div className="mt-6 grid gap-4 border-t border-neutral-800 pt-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<select
							value={selected.unitId}
							onChange={(event) => setUnitId(Number(event.target.value))}
							className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 focus:border-[color:var(--accent)] focus:outline-none"
						>
							{rows.map((row) => (
								<option key={row.unitId} value={row.unitId}>
									[{row.unitTag}] {row.unitName}
								</option>
							))}
						</select>
						<p className="max-w-md text-xs leading-relaxed text-neutral-500">{t('calcLegend')}</p>
					</div>

					<div className="flex w-full flex-wrap items-baseline justify-center gap-x-6 gap-y-3 sm:justify-between sm:px-6">
						<LabeledNum value={fmt1(selected.rawPoints)} label={t('fPoints')} big />
						<span className="text-2xl text-neutral-500">÷</span>
						<LabeledNum value={`√${fmt1(selected.avgParticipants)}`} label={t('fAvgPlayers')} big />
						<span className="text-2xl text-neutral-500">=</span>
						<LabeledNum value={fmt1(selected.balanced)} label={t('fRating')} accent big />
					</div>
				</div>
			)}
		</div>
	);
}
