'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';

export const SPEEDS = [1, 4, 16, 60] as const;

type Props = {
	model: ReplayModel;
	time: number;
	playing: boolean;
	speed: number;
	realTime: string | null;
	sideColor: (side: string | null) => string;
	onTogglePlay: () => void;
	onSpeed: (speed: number) => void;
	onSeek: (t: number) => void;
};

export default function Timeline({ model, time, playing, speed, realTime, sideColor, onTogglePlay, onSpeed, onSeek }: Props) {
	const t = useTranslations('replayViewer');
	const duration = Math.max(1, model.duration);

	// Freeze spans and resume points drawn on the track, and a tick per kill by side.
	const marks = useMemo(() => {
		const freezes: { from: number; to: number }[] = [];
		const resumes: number[] = [];
		const kills: { at: number; color: string }[] = [];
		let open: number | null = null;
		for (const event of model.events) {
			if (event.type === 'flow') {
				if ((event.flow === 'freeze' || event.flow === 'hardfreeze') && open === null) open = event.t;
				if ((event.flow === 'freeze-end' || event.flow === 'hardfreeze-end') && open !== null) {
					freezes.push({ from: open, to: event.t });
					open = null;
				}
			} else if (event.type === 'resume') {
				resumes.push(event.t);
			} else if (event.type === 'kill') {
				const killer = event.killer !== null ? model.entities.get(event.killer) : null;
				kills.push({ at: event.t, color: sideColor(killer?.side ?? null) });
			}
		}
		if (open !== null) freezes.push({ from: open, to: model.duration });
		return { freezes, resumes, kills };
	}, [model, sideColor]);

	const pct = (v: number) => `${Math.min(100, Math.max(0, (v / duration) * 100))}%`;

	return (
		<div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 bg-neutral-950 px-3 py-3 sm:gap-4 sm:px-4">
			<button
				type="button"
				onClick={onTogglePlay}
				aria-label={playing ? t('pause') : t('play')}
				className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-neutral-950 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
			>
				{playing ? (
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<rect x="6" y="5" width="4" height="14" rx="1" />
						<rect x="14" y="5" width="4" height="14" rx="1" />
					</svg>
				) : (
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M8 5v14l11-7z" />
					</svg>
				)}
			</button>

			<div role="group" aria-label={t('speed')} className="flex rounded-xl bg-white/5 p-1">
				{SPEEDS.map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => onSpeed(value)}
						aria-pressed={speed === value}
						className={
							'min-h-9 min-w-10 rounded-lg px-2 font-mono text-xs font-semibold tabular-nums ' +
							(speed === value ? 'bg-white/15 text-neutral-50' : 'text-neutral-400 hover:text-neutral-100')
						}
					>
						{value}×
					</button>
				))}
			</div>

			<div className="flex min-w-[9rem] flex-col">
				<span className="font-mono text-sm font-semibold tabular-nums text-neutral-50">
					{formatMissionTime(time)} <span className="text-neutral-500">/ {formatMissionTime(model.duration)}</span>
				</span>
				{realTime ? <span className="text-xs text-neutral-400">{t('realTime', { time: realTime })}</span> : null}
			</div>

			<div className="relative h-8 min-w-[12rem] flex-[999_1_20rem]">
				<div className="pointer-events-none absolute inset-x-0 top-[14px] h-1 rounded bg-neutral-800" />
				{marks.freezes.map((span, i) => (
					<div
						key={`f${i}`}
						className="pointer-events-none absolute top-[10px] h-3 rounded-sm bg-amber-400/25"
						style={{ left: pct(span.from), width: `calc(${pct(span.to)} - ${pct(span.from)})` }}
					/>
				))}
				<div className="pointer-events-none absolute top-[14px] h-1 rounded bg-[color:var(--accent)]" style={{ left: 0, width: pct(time) }} />
				{marks.kills.map((kill, i) => (
					<div key={`k${i}`} className="pointer-events-none absolute top-[3px] h-2 w-0.5" style={{ left: pct(kill.at), background: kill.color }} />
				))}
				{marks.resumes.map((at, i) => (
					<div key={`r${i}`} className="pointer-events-none absolute top-0 h-8 w-0.5 bg-amber-400" style={{ left: pct(at) }} />
				))}
				<input
					type="range"
					min={0}
					max={duration}
					step={10}
					value={Math.min(duration, Math.round(time))}
					onChange={(e) => onSeek(Number(e.target.value))}
					aria-label={t('seek')}
					aria-valuetext={formatMissionTime(time)}
					className="absolute inset-0 h-8 w-full cursor-pointer appearance-none bg-transparent opacity-0"
				/>
				<div
					className="pointer-events-none absolute top-[8px] h-4 w-4 -translate-x-1/2 rounded-full bg-[color:var(--accent)] ring-4 ring-neutral-950"
					style={{ left: pct(time) }}
				/>
			</div>
		</div>
	);
}
