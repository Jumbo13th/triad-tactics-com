'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UnitScoreWithUnit } from '../domain/types';
import { fmt1 } from './tableStyles';

// Bars are three NESTED rounded rects (total → base+objectives → base): pill
// caps on both ends without seam artifacts.
const ROW = 30;
const TOP = 26; // room for the value ticks
const BOTTOM = 6;
const LABEL_W = 96;
const VALUE_W = 150;
const BAR_H = 9;

const SEGMENTS = {
	base: '#c8cdd4',
	objectives: '#d2b853',
	bonus: '#c08a52',
};

export default function UnitBreakdownChart({
	scores,
	sideColors = {},
}: {
	scores: UnitScoreWithUnit[];
	sideColors?: Record<string, string>;
}) {
	const t = useTranslations('stats');
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(480);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		// The container scrolls, so its measured width is never inflated by the svg.
		const observer = new ResizeObserver((entries) => {
			setWidth(Math.max(480, entries[0].contentRect.width));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const rows = scores
		.slice()
		.sort((a, b) => b.finalPoints - a.finalPoints)
		.map((row) => ({
			key: `${row.unitId}|${row.side}`,
			tag: row.unitTag,
			name: row.unitName,
			side: row.side,
			base: Math.max(0, row.basePoints),
			objectives: Math.max(0, row.objectivePoints),
			bonus: Math.max(0, row.finalPoints - row.basePoints - row.objectivePoints),
			final: row.finalPoints,
		}));

	if (rows.length === 0) return null;

	const maxTotal = Math.max(1, ...rows.map((r) => r.base + r.objectives + r.bonus));
	const height = TOP + rows.length * ROW + BOTTOM;
	const barLeft = LABEL_W + 12;
	const barSpan = width - barLeft - VALUE_W;
	const w = (value: number) => (value / maxTotal) * barSpan;

	const tickStep = Math.max(1, Math.ceil(maxTotal / 4 / 5) * 5);
	const ticks = [1, 2, 3, 4].map((i) => i * tickStep).filter((v) => v <= maxTotal * 1.02);

	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap gap-4 text-xs font-semibold text-neutral-400">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEGMENTS.base }} />
					{t('chartBase')}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEGMENTS.objectives }} />
					{t('colObjectives')}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEGMENTS.bonus }} />
					{t('bonusLabel')}
				</span>
			</div>

			<div ref={containerRef} className="w-full overflow-x-auto">
				<svg width={width} height={height} className="block" role="img">
					{ticks.map((tick) => (
						<g key={tick}>
							<line
								x1={barLeft + w(tick)}
								y1={TOP - 6}
								x2={barLeft + w(tick)}
								y2={height - BOTTOM}
								stroke="#1f1f1f"
								strokeDasharray="2 4"
							/>
							<text x={barLeft + w(tick)} y={TOP - 12} fill="#525252" fontSize={11} textAnchor="middle">
								{tick}
							</text>
						</g>
					))}

					{rows.map((row, index) => {
						const y = TOP + index * ROW;
						const barY = y + (ROW - BAR_H) / 2;
						const total = row.base + row.objectives + row.bonus;

						return (
							<g key={row.key}>
								<text
									x={LABEL_W}
									y={y + ROW / 2 + 4}
									fontSize={12}
									fontWeight={700}
									textAnchor="end"
									fill={sideColors[row.side] ?? '#a3a3a3'}
								>
									{row.tag}
									<title>{`[${row.tag}] ${row.name} — ${row.side}`}</title>
								</text>

								<rect x={barLeft} y={barY} width={barSpan} height={BAR_H} rx={BAR_H / 2} fill="#161616" />
								{total > 0 && (
									<rect x={barLeft} y={barY} width={Math.max(BAR_H, w(total))} height={BAR_H} rx={BAR_H / 2} fill={SEGMENTS.bonus} />
								)}
								{row.base + row.objectives > 0 && (
									<rect
										x={barLeft}
										y={barY}
										width={Math.max(BAR_H, w(row.base + row.objectives))}
										height={BAR_H}
										rx={BAR_H / 2}
										fill={SEGMENTS.objectives}
									/>
								)}
								{row.base > 0 && (
									<rect x={barLeft} y={barY} width={Math.max(BAR_H, w(row.base))} height={BAR_H} rx={BAR_H / 2} fill={SEGMENTS.base} />
								)}

								<text x={barLeft + Math.max(BAR_H, w(total)) + 10} y={y + ROW / 2 + 4} fontSize={12} fontWeight={600} fill="#737373">
									{fmt1(row.final)}
								</text>
							</g>
						);
					})}
				</svg>
			</div>
		</div>
	);
}
