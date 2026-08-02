'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { fmt1 } from './tableStyles';

// Below sm the pinned column is dropped; finish labels move inside the chart.
function useCompact(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const media = window.matchMedia('(max-width: 639px)');
			media.addEventListener('change', onChange);
			return () => media.removeEventListener('change', onChange);
		},
		() => window.matchMedia('(max-width: 639px)').matches,
		() => false
	);
}

export type RaceSeries = { unitTag: string; ranks: number[]; totals: number[] };

// Fixed pixel geometry (no viewBox scaling) — text keeps its size on every screen.
const ROW = 34;
const TOP = 28;
const BOTTOM = 58; // two staggered rows of game labels
const PAD_LEFT = 28;
const PAD_RIGHT = 28;
const LABELS_W = 150; // pinned standings column
const MIN_COL = 116; // px per game step before horizontal scrolling kicks in

const MEDALS: Record<number, string> = { 1: '#f2c94c', 2: '#c8cdd4', 3: '#cd8a4e' };

const HIGHLIGHT_COUNT = 5;
const FIELD_GREY = '#3a3a3a';

const COLORS = [
	'#d2b853', '#60a5fa', '#f472b6', '#4ade80', '#fb923c', '#c4b5fd', '#2dd4bf', '#f87171',
	'#facc15', '#93c5fd', '#e879f9', '#a3e635', '#fdba74', '#5eead4', '#f9a8d4', '#94a3b8',
];

function truncate(label: string, max: number): string {
	return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export default function RaceBumpChart({
	games,
	series,
	row = ROW,
}: {
	games: string[];
	series: RaceSeries[];
	row?: number; // rank row spacing — fullscreen passes a taller value
}) {
	const [hovered, setHovered] = useState<string | null>(null);
	const [pinned, setPinned] = useState<string | null>(null);
	const [released, setReleased] = useState<string | null>(null);
	const focus = pinned ?? hovered;
	const compact = useCompact();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [avail, setAvail] = useState<number | null>(null);

	const togglePin = (tag: string) => {
		if (pinned === tag) {
			setPinned(null);
			setReleased(tag);
		} else {
			setPinned(tag);
		}
	};

	useEffect(() => {
		if (released === null) return;
		const timer = window.setTimeout(() => setReleased(null), 500);
		return () => window.clearTimeout(timer);
	}, [released]);
	// Per-instance id: the card + fullscreen render together, and duplicate SVG
	// filter ids resolve to whichever is first in the DOM.
	const glowId = `race-glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			setAvail(entries[0].contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const measured = avail !== null;
	useEffect(() => {
		const el = scrollRef.current;
		if (measured && el) el.scrollLeft = el.scrollWidth;
	}, [measured]);

	if (games.length < 1 || series.length === 0) return null;

	const maxRank = Math.max(...series.flatMap((s) => s.ranks));
	const height = TOP + (maxRank - 1) * row + BOTTOM;
	const padRight = compact ? 150 : PAD_RIGHT;
	const steps = games.length - 1;
	const col = steps > 0 ? (avail ? Math.max(MIN_COL, (avail - PAD_LEFT - padRight) / steps) : MIN_COL) : 0;
	const chartW = steps > 0 ? PAD_LEFT + steps * col + padRight : Math.max(avail ?? 480, 320);
	// A lone game still sits where a final point would — flush against the finish
	// column — or its dots would float half a chart away from their own labels.
	const gameX = (index: number) => (steps > 0 ? PAD_LEFT + index * col : chartW - padRight);
	const rankY = (rank: number) => TOP + (rank - 1) * row;

	const pathFor = (ranks: number[]) => {
		let d = `M ${gameX(0)} ${rankY(ranks[0])}`;
		for (let i = 1; i < ranks.length; i++) {
			const x0 = gameX(i - 1);
			const x1 = gameX(i);
			const mid = (x0 + x1) / 2;
			d += ` C ${mid} ${rankY(ranks[i - 1])}, ${mid} ${rankY(ranks[i])}, ${x1} ${rankY(ranks[i])}`;
		}
		return d;
	};

	const drawOrder = focus ? [...series].sort((a, b) => (a.unitTag === focus ? 1 : 0) - (b.unitTag === focus ? 1 : 0)) : series;
	const colorOf = (tag: string) => COLORS[series.findIndex((s) => s.unitTag === tag) % COLORS.length];

	return (
		<div className="flex" onMouseLeave={() => setHovered(null)}>
			<style>{`
				@keyframes race-draw { from { stroke-dashoffset: 1; } }
				.race-draw { stroke-dasharray: 1; animation: race-draw 650ms cubic-bezier(0.4, 0, 0.2, 1); }
				@keyframes race-release { from { stroke-width: 5; } }
				.race-release { animation: race-release 450ms ease-out; }
				@keyframes race-pop { 0% { transform: scale(0); } 70% { transform: scale(1.6); } 100% { transform: scale(1); } }
				.race-pop { transform-box: fill-box; transform-origin: center; animation: race-pop 400ms both; }
				@keyframes race-label-pop { from { transform: scale(0.82); } }
				.race-label-pop { animation: race-label-pop 250ms ease-out; }
				@media (prefers-reduced-motion: reduce) {
					.race-draw, .race-release, .race-pop, .race-label-pop { animation: none; }
				}
			`}</style>
			<div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
				<svg
					width={chartW}
					height={height}
					className="block"
					role="img"
					onClick={() => {
						if (pinned) {
							setReleased(pinned);
							setPinned(null);
						}
					}}
				>
					<defs>
						{/* userSpaceOnUse: a bbox-relative region collapses to zero on a flat line and the path vanishes */}
						<filter id={glowId} filterUnits="userSpaceOnUse" x={-20} y={-20} width={chartW + 40} height={height + 40}>
							<feGaussianBlur stdDeviation="4" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => (
						<line key={rank} x1={0} y1={rankY(rank)} x2={steps > 0 ? gameX(steps) + 10 : chartW} y2={rankY(rank)} stroke="#161616" />
					))}

					{games.map((game, index) => (
						<g key={index}>
							<line x1={gameX(index)} y1={TOP - 12} x2={gameX(index)} y2={rankY(maxRank) + 12} stroke="#1f1f1f" strokeDasharray="2 4" />
							<text
								x={gameX(index)}
								y={index % 2 === 0 ? height - 28 : height - 10}
								fill="#737373"
								fontSize={12}
								textAnchor={index === 0 && games.length > 1 ? 'start' : index === games.length - 1 ? 'end' : 'middle'}
							>
								{truncate(game, 20)}
								<title>{game}</title>
							</text>
						</g>
					))}

					{drawOrder.map((s) => {
						const index = series.indexOf(s);
						const color = colorOf(s.unitTag);
						const isFocused = focus === s.unitTag;
						const isPinned = pinned === s.unitTag;
						const dimmed = focus !== null && !isFocused;

						const colored = isFocused || (focus === null && index < HIGHLIGHT_COUNT);
						const lineColor = colored ? color : dimmed ? '#2e2e2e' : FIELD_GREY;

						return (
							<g
								key={s.unitTag}
								style={{ cursor: 'pointer' }}
								onMouseEnter={() => setHovered(s.unitTag)}
								onClick={(event) => {
									event.stopPropagation();
									togglePin(s.unitTag);
								}}
							>
								<path d={pathFor(s.ranks)} fill="none" stroke="transparent" strokeWidth={16} />
								{/* key restarts the draw animation on every new pin */}
								<path
									key={`line-${isPinned}`}
									d={pathFor(s.ranks)}
									pathLength={1}
									fill="none"
									stroke={lineColor}
									strokeWidth={isFocused ? 3.5 : colored ? (index === 0 ? 3 : 2.5) : 1.5}
									strokeLinecap="round"
									filter={isFocused ? `url(#${glowId})` : undefined}
									className={isPinned ? 'race-draw' : released === s.unitTag ? 'race-release' : undefined}
									style={{ transition: 'stroke 200ms ease' }}
								/>
								{s.ranks.map((rank, gameIndex) => (
									<circle
										key={`dot-${gameIndex}-${isPinned}`}
										cx={gameX(gameIndex)}
										cy={rankY(rank)}
										r={isFocused ? 5 : colored ? 4 : 3}
										fill={lineColor}
										className={isPinned ? 'race-pop' : undefined}
										style={{
											transition: 'fill 200ms ease',
											animationDelay: isPinned ? `${(gameIndex / Math.max(1, s.ranks.length - 1)) * 550}ms` : undefined,
										}}
									/>
								))}
								{isFocused &&
									s.ranks.map((rank, gameIndex) => (
										<text
											key={`pts-${gameIndex}`}
											x={gameX(gameIndex)}
											y={rankY(rank) - 12}
											fill="#e5e5e5"
											fontSize={11}
											fontWeight={600}
											textAnchor="middle"
										>
											{fmt1(s.totals[gameIndex])}
										</text>
									))}
								{compact && (() => {
									const finalRank = s.ranks[s.ranks.length - 1];
									const medal = MEDALS[finalRank];
									return (
										<text x={gameX(games.length - 1) + 14} y={rankY(finalRank) + 4} fontSize={12} style={{ transition: 'fill 200ms ease' }}>
											<tspan fill={dimmed ? '#3a3a3a' : (medal ?? '#525252')} fontWeight={700}>
												#{finalRank}
											</tspan>
											<tspan dx={6} fill={colored ? color : dimmed ? '#4a4a4a' : '#a3a3a3'} fontWeight={700}>
												{s.unitTag}
											</tspan>
											<tspan dx={6} fill={dimmed ? '#3a3a3a' : '#737373'}>
												{fmt1(s.totals[s.totals.length - 1])}
											</tspan>
										</text>
									);
								})()}
							</g>
						);
					})}
				</svg>
			</div>

			{/* Finish column: the lines END on the right, so the standings read
			    where the eye already is. */}
			{!compact && (
			<div className="relative shrink-0 border-l border-neutral-800/60 pl-3" style={{ width: LABELS_W, height }}>
				{series.map((s, index) => {
					const color = colorOf(s.unitTag);
					const isFocused = focus === s.unitTag;
					const dimmed = focus !== null && !isFocused;
					const colored = isFocused || (focus === null && index < HIGHLIGHT_COUNT);
					const finalRank = s.ranks[s.ranks.length - 1];
					const medal = MEDALS[finalRank];
					const tagColor = colored ? color : dimmed ? '#4a4a4a' : '#a3a3a3';

					return (
						<button
							key={s.unitTag}
							type="button"
							className={`absolute left-3 flex origin-left items-baseline gap-1.5 whitespace-nowrap text-xs ${
								pinned === s.unitTag ? 'race-label-pop' : ''
							}`}
							style={{ top: rankY(finalRank) - 8, transition: 'opacity 150ms ease', opacity: dimmed ? 0.45 : 1 }}
							onMouseEnter={() => setHovered(s.unitTag)}
							onClick={() => togglePin(s.unitTag)}
						>
							<span className="font-bold" style={{ color: dimmed ? '#3a3a3a' : (medal ?? '#525252') }}>
								#{finalRank}
							</span>
							<span className="font-bold" style={{ color: tagColor }}>
								{s.unitTag}
							</span>
							<span className="tabular-nums text-neutral-500">{fmt1(s.totals[s.totals.length - 1])}</span>
						</button>
					);
				})}
			</div>
			)}
		</div>
	);
}
