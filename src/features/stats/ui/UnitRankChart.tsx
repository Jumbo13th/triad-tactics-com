'use client';

import { useEffect, useRef, useState } from 'react';

// Rank axis is ZOOMED to the unit's own range (±1, min span 4): a mid-table
// unit on a full 1..N axis is a flat line in a sea of empty rows.
const H = 200;
const TOP = 30;
const BOTTOM = 48; // two staggered rows of game labels
const LEFT = 36;
const RIGHT = 24;

const ACCENT = '#d2b853';

function truncate(label: string, max: number): string {
	return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default function UnitRankChart({
	games,
	ranks,
	totalUnits,
}: {
	games: string[];
	ranks: number[];
	totalUnits: number;
}) {
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

	if (games.length < 2 || ranks.length !== games.length || totalUnits < 2) return null;

	let lo = Math.max(1, Math.min(...ranks) - 1);
	let hi = Math.min(totalUnits, Math.max(...ranks) + 1);
	while (hi - lo < 4 && (lo > 1 || hi < totalUnits)) {
		if (lo > 1) lo--;
		if (hi - lo < 4 && hi < totalUnits) hi++;
	}

	const x = (index: number) => LEFT + (index * (width - LEFT - RIGHT)) / (games.length - 1);
	const y = (rank: number) => TOP + ((rank - lo) / Math.max(1, hi - lo)) * (H - TOP - BOTTOM);

	let d = `M ${x(0)} ${y(ranks[0])}`;
	for (let i = 1; i < ranks.length; i++) {
		const mid = (x(i - 1) + x(i)) / 2;
		d += ` C ${mid} ${y(ranks[i - 1])}, ${mid} ${y(ranks[i])}, ${x(i)} ${y(ranks[i])}`;
	}

	const axisRanks = [...new Set([lo, Math.round((lo + hi) / 2), hi])];

	return (
		<div ref={containerRef} className="w-full overflow-x-auto">
			<svg width={width} height={H} className="block" role="img">
				{axisRanks.map((rank) => (
					<g key={rank}>
						<line x1={LEFT} y1={y(rank)} x2={width - RIGHT} y2={y(rank)} stroke="#1a1a1a" />
						<text x={LEFT - 10} y={y(rank) + 4} fill="#525252" fontSize={11} textAnchor="end">
							{rank}
						</text>
					</g>
				))}

				<path d={d} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />

				{ranks.map((rank, index) => (
					<g key={index}>
						<circle cx={x(index)} cy={y(rank)} r={4} fill={ACCENT} />
						<text x={x(index)} y={y(rank) - 11} fill="#e5e5e5" fontSize={11} fontWeight={700} textAnchor="middle">
							#{rank}
						</text>
						<text
							x={x(index)}
							y={H - (index % 2 === 0 ? 22 : 6)}
							fill="#737373"
							fontSize={11}
							textAnchor={index === 0 ? 'start' : index === games.length - 1 ? 'end' : 'middle'}
						>
							{truncate(games[index], 18)}
							<title>{games[index]}</title>
						</text>
					</g>
				))}
			</svg>
		</div>
	);
}
