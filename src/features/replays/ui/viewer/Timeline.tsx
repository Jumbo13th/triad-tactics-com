'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';
import { Icon } from './glyphs';
import { useDismiss } from './useDismiss';
import type { SideStyle } from './sideStyle';
import { SPEED_MAX, SPEED_MIN } from './viewerSettings';

/** The speeds offered, and the steps the [ and ] keys move through. */
export const SPEED_PRESETS = [0.5, 1, 2, 4, 8, 16, 30, 60, 120];

type Props = {
	model: ReplayModel;
	time: number;
	playing: boolean;
	speed: number;
	realTime: string | null;
	sideStyle: (side: string | null) => SideStyle;
	sideName: (key: string) => string;
	zoneName: (zid: number) => string;
	onTogglePlay: () => void;
	onSpeed: (speed: number) => void;
	onSeek: (t: number) => void;
};

type Marks = {
	lanes: string[];
	kills: { at: number; lane: number }[];
	freezes: { from: number; to: number; hard: boolean }[];
	resumes: number[];
	captures: { at: number; side: string; zid: number }[];
};

// Vertical layout of the scrubber, in pixels from its top.
const LANE_TOP = 14;
const LANE_H = 4;
const LANE_GAP = 2;
const BAND_TOP = 32;
const BAND_H = 12;
const TRACK_TOP = 36;
const AXIS_TOP = 47;
const HEIGHT = 60;
const MAX_LANES = 3;
const AXIS_STEPS = [5, 10, 15, 30, 60, 120].map((minutes) => minutes * 600);
const HATCH = 'repeating-linear-gradient(135deg,rgba(163,163,163,0.6) 0 1px,transparent 1px 4px)';

function formatSpeed(speed: number): string {
	return `${Number(speed.toFixed(2))}×`;
}

function collectMarks(model: ReplayModel): Marks {
	const lanes = model.sides.slice(0, MAX_LANES).map((side) => side.key);
	const kills: Marks['kills'] = [];
	const freezes: Marks['freezes'] = [];
	const resumes: number[] = [];
	const captures: Marks['captures'] = [];
	let open: { from: number; hard: boolean } | null = null;
	for (const event of model.events) {
		if (event.type === 'flow') {
			const starts = event.flow === 'freeze' || event.flow === 'hardfreeze';
			const ends = event.flow === 'freeze-end' || event.flow === 'hardfreeze-end';
			if (starts && open === null) open = { from: event.t, hard: event.flow === 'hardfreeze' };
			if (ends && open !== null) {
				freezes.push({ ...open, to: event.t });
				open = null;
			}
		} else if (event.type === 'resume') {
			resumes.push(event.t);
		} else if (event.type === 'capture') {
			captures.push({ at: event.t, side: event.side, zid: event.zid });
		} else if (event.type === 'kill' && event.killer !== null && event.killer !== event.victim) {
			const side = model.entities.get(event.killer)?.side;
			const lane = side ? lanes.indexOf(side) : -1;
			if (lane >= 0) kills.push({ at: event.t, lane });
			else if (side && lanes.length === MAX_LANES) kills.push({ at: event.t, lane: MAX_LANES - 1 });
		}
	}
	if (open !== null) freezes.push({ ...open, to: model.duration });
	return { lanes, kills, freezes, resumes, captures };
}

// Everything on the scrubber that does not move with the playhead, drawn once per replay.
const StaticMarks = memo(function StaticMarks({
	marks,
	duration,
	sideStyle,
	labels,
}: {
	marks: Marks;
	duration: number;
	sideStyle: (side: string | null) => SideStyle;
	labels: { freeze: string; hardFreeze: string; resumed: string };
}) {
	const pct = (v: number) => `${Math.min(100, Math.max(0, (v / duration) * 100))}%`;
	const step = AXIS_STEPS.find((s) => duration / s <= 8) ?? AXIS_STEPS[AXIS_STEPS.length - 1];
	const axis: number[] = [];
	for (let at = 0; at <= duration; at += step) axis.push(at);
	return (
		<>
			{marks.freezes.map((span, i) =>
				(span.to - span.from) / duration > 0.06 ? (
					<span key={`fl${i}`} className="absolute top-0 whitespace-nowrap text-[11px] font-medium leading-[12px] text-neutral-400" style={{ left: pct(span.from) }}>
						{span.hard ? labels.hardFreeze : labels.freeze}
					</span>
				) : null
			)}
			{marks.resumes.map((at, i) => (
				<span
					key={`rl${i}`}
					className="absolute top-0 whitespace-nowrap bg-[#121212] pr-[4px] text-[11px] font-semibold leading-[12px] text-neutral-300"
					style={{ left: `calc(${pct(at)} + 5px)` }}
				>
					{labels.resumed}
				</span>
			))}
			{marks.captures.map((capture, i) => {
				const style = sideStyle(capture.side);
				return (
					<span
						key={`c${i}`}
						className="absolute top-[2px] size-[7px] rotate-45"
						style={{ left: `calc(${pct(capture.at)} - 4px)`, background: style.fill, boxShadow: `inset 0 0 0 1.5px ${style.edge}` }}
					/>
				);
			})}
			{marks.lanes.map((side, i) => (
				<span key={`l${side}`} className="absolute inset-x-0 bg-[#1a1a1a]" style={{ top: LANE_TOP + i * (LANE_H + LANE_GAP), height: LANE_H }} />
			))}
			{marks.kills.map((kill, i) => (
				<span
					key={`k${i}`}
					className="absolute w-[2px]"
					style={{ left: pct(kill.at), top: LANE_TOP + kill.lane * (LANE_H + LANE_GAP), height: LANE_H, background: sideStyle(marks.lanes[kill.lane]).fill }}
				/>
			))}
			{marks.freezes.map((span, i) => (
				<span
					key={`f${i}`}
					className="absolute"
					style={{
						left: pct(span.from),
						width: `calc(${pct(span.to)} - ${pct(span.from)})`,
						top: BAND_TOP,
						height: BAND_H,
						background: HATCH,
						boxShadow: 'inset 0 0 0 1px rgba(163,163,163,0.4)',
					}}
				/>
			))}
			<span className="absolute inset-x-0 rounded-[2px] bg-[#333333]" style={{ top: TRACK_TOP, height: 4 }} />
			{marks.resumes.map((at, i) => (
				<span key={`r${i}`} className="absolute top-0 w-px bg-neutral-100" style={{ left: pct(at), height: BAND_TOP + BAND_H }} />
			))}
			{axis.map((at, i) => (
				<span key={`a${at}`}>
					<span className="absolute h-[3px] w-px bg-[#666666]" style={{ left: pct(at), top: AXIS_TOP - 2 }} />
					<span
						className={'absolute text-[11px] leading-[12px] tabular-nums text-neutral-400 ' + (i === 0 ? '' : '-translate-x-1/2')}
						style={{ left: pct(at), top: AXIS_TOP + 1 }}
					>
						{formatMissionTime(at).slice(0, 5)}
					</span>
				</span>
			))}
		</>
	);
});

function SpeedControl({ speed, onSpeed }: { speed: number; onSpeed: (speed: number) => void }) {
	const t = useTranslations('replayViewer');
	const [open, setOpen] = useState(false);
	const [custom, setCustom] = useState('');
	const rootRef = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, rootRef, close);

	const applyCustom = () => {
		const value = Number(custom.replace(',', '.'));
		if (!Number.isFinite(value) || value <= 0) return;
		onSpeed(Math.min(SPEED_MAX, Math.max(SPEED_MIN, value)));
		setCustom('');
		setOpen(false);
	};

	return (
		<div ref={rootRef} className="relative shrink-0">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={t('speedButton', { speed: formatSpeed(speed) })}
				title={t('speedHint')}
				className={
					'inline-flex min-h-[40px] min-w-[72px] items-center justify-center gap-[6px] rounded-[4px] border px-[10px] text-[13px] font-semibold leading-[18px] tabular-nums ' +
					(open ? 'border-[rgba(210,184,83,0.5)] bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]' : 'border-[#2c2c2c] bg-[#1a1a1a] text-neutral-100 hover:border-[#666666]')
				}
			>
				{formatSpeed(speed)}
				<span className="flex text-neutral-400">
					<Icon.ChevronUp size={14} />
				</span>
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label={t('speed')}
					className="absolute bottom-full right-0 z-20 mb-[8px] w-[232px] rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
				>
					<p className="pb-[8px] text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-neutral-400">{t('speed')}</p>
					<div className="grid grid-cols-3 gap-[4px]">
						{SPEED_PRESETS.map((value) => (
							<button
								key={value}
								type="button"
								aria-pressed={speed === value}
								onClick={() => {
									onSpeed(value);
									setOpen(false);
								}}
								className={
									'min-h-[36px] rounded-[4px] border text-[13px] font-semibold tabular-nums ' +
									(speed === value
										? 'border-[rgba(210,184,83,0.5)] bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]'
										: 'border-[#2c2c2c] bg-[#121212] text-neutral-300 hover:border-[#666666] hover:text-neutral-100')
								}
							>
								{formatSpeed(value)}
							</button>
						))}
					</div>
					<form
						className="mt-[8px] flex items-center gap-[6px]"
						onSubmit={(e) => {
							e.preventDefault();
							applyCustom();
						}}
					>
						<label className="flex min-w-0 flex-1 items-center gap-[6px] rounded-[4px] border border-[#666666] bg-[#121212] px-[8px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[color:var(--accent)]">
							<span className="sr-only">{t('customSpeed')}</span>
							<input
								type="number"
								inputMode="decimal"
								min={SPEED_MIN}
								max={SPEED_MAX}
								step="any"
								value={custom}
								onChange={(e) => setCustom(e.target.value)}
								placeholder={t('customSpeed')}
								className="h-[34px] min-w-0 flex-1 bg-transparent text-[13px] tabular-nums text-neutral-100 outline-none placeholder:text-neutral-500"
							/>
							<span className="text-[13px] text-neutral-400">×</span>
						</label>
						<button type="submit" className="min-h-[36px] rounded-[4px] bg-[color:var(--accent)] px-[12px] text-[13px] font-semibold text-[#0a0a0a] hover:bg-[#dcc56c]">
							{t('setSpeed')}
						</button>
					</form>
					<p className="pt-[8px] text-[12px] leading-[16px] text-neutral-400">{t('speedHint')}</p>
				</div>
			) : null}
		</div>
	);
}

export default function Timeline(props: Props) {
	const { model, time, playing, speed, realTime, sideStyle, sideName, zoneName, onTogglePlay, onSpeed, onSeek } = props;
	const t = useTranslations('replayViewer');
	const duration = Math.max(1, model.duration);
	const marks = useMemo(() => collectMarks(model), [model]);
	const labels = useMemo(() => ({ freeze: t('freeze'), hardFreeze: t('hardFreeze'), resumed: t('resumedShort') }), [t]);
	const [hover, setHover] = useState<{ x: number; width: number } | null>(null);
	const pct = (v: number) => `${Math.min(100, Math.max(0, (v / duration) * 100))}%`;
	const lanesBottom = LANE_TOP + marks.lanes.length * (LANE_H + LANE_GAP);

	// What the pointer is over: the time there and anything marked within a few pixels.
	const tooltip = (() => {
		if (!hover || hover.width <= 0) return null;
		const at = Math.max(0, Math.min(duration, (hover.x / hover.width) * duration));
		const near = (6 / hover.width) * duration;
		const notes: string[] = [];
		for (const resume of marks.resumes) if (Math.abs(resume - at) <= near) notes.push(t('resumedLong'));
		for (const capture of marks.captures) {
			if (Math.abs(capture.at - at) <= near) notes.push(t('capturedPlain', { side: sideName(capture.side), zone: zoneName(capture.zid) }));
		}
		const kills = marks.kills.filter((kill) => Math.abs(kill.at - at) <= near).length;
		if (kills > 0) notes.push(t('killsNear', { count: kills }));
		const freeze = marks.freezes.find((span) => at >= span.from && at <= span.to);
		if (freeze) notes.push(freeze.hard ? t('hardFreeze') : t('freeze'));
		return { at, notes };
	})();

	return (
		<div role="group" aria-label={t('playback')} className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px] border-t border-[#2c2c2c] bg-[#121212] px-[12px] py-[6px] lg:flex-nowrap">
			<button
				type="button"
				onClick={onTogglePlay}
				aria-label={playing ? t('pause') : t('play')}
				title={t('playHint')}
				className="inline-flex size-[40px] shrink-0 items-center justify-center rounded-[4px] bg-[color:var(--accent)] text-[#0a0a0a] hover:bg-[#dcc56c] active:bg-[#bca243] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
			>
				{playing ? <Icon.Pause /> : <Icon.Play />}
			</button>

			<div className="flex min-w-[128px] flex-1 flex-col lg:flex-none">
				<span className="text-[15px] font-semibold leading-[20px] tabular-nums text-neutral-100">
					{formatMissionTime(time)} <span className="text-[12px] font-medium text-neutral-400">/ {formatMissionTime(model.duration)}</span>
				</span>
				{realTime ? <span className="text-[12px] leading-[16px] text-neutral-400">{t('realTime', { time: realTime })}</span> : null}
			</div>

			<div
				className="relative order-last min-w-[240px] flex-[1_1_100%] rounded-[2px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-[color:var(--accent)] lg:order-none lg:flex-[1_1_auto]"
				style={{ height: HEIGHT }}
				onPointerMove={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					setHover({ x: e.clientX - rect.left, width: rect.width });
				}}
				onPointerLeave={() => setHover(null)}
			>
				<StaticMarks marks={marks} duration={duration} sideStyle={sideStyle} labels={labels} />
				{/* Kills still ahead show at half strength. */}
				<span className="pointer-events-none absolute right-0 bg-[rgba(18,18,18,0.5)]" style={{ left: pct(time), top: LANE_TOP, height: lanesBottom - LANE_TOP }} />
				<span className="pointer-events-none absolute left-0 rounded-[2px] bg-[color:var(--accent)]" style={{ top: TRACK_TOP, height: 4, width: pct(time) }} />
				<span className="pointer-events-none absolute w-[2px] -translate-x-1/2 bg-[color:var(--accent)]" style={{ left: pct(time), top: 10, height: BAND_TOP + BAND_H - 10 }} />
				<span
					className="pointer-events-none absolute size-[12px] -translate-x-1/2 rotate-45 bg-[color:var(--accent)] shadow-[0_0_0_2px_#121212]"
					style={{ left: pct(time), top: TRACK_TOP - 4 }}
				/>
				{tooltip ? (
					<>
						<span className="pointer-events-none absolute w-px bg-neutral-300" style={{ left: hover?.x ?? 0, top: 6, height: HEIGHT - 14 }} />
						<span
							role="tooltip"
							className="pointer-events-none absolute bottom-full z-10 mb-[6px] flex -translate-x-1/2 flex-col gap-[2px] whitespace-nowrap rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] px-[10px] py-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
							style={{ left: Math.max(60, Math.min((hover?.width ?? 0) - 60, hover?.x ?? 0)) }}
						>
							<span className="text-[12px] font-semibold leading-[16px] tabular-nums text-neutral-100">{formatMissionTime(tooltip.at)}</span>
							{tooltip.notes.map((note, i) => (
								<span key={i} className="text-[12px] leading-[16px] text-neutral-400">
									{note}
								</span>
							))}
						</span>
					</>
				) : null}
				<input
					type="range"
					min={0}
					max={duration}
					step={10}
					value={Math.min(duration, Math.round(time))}
					onChange={(e) => onSeek(Number(e.target.value))}
					aria-label={t('seek')}
					aria-valuetext={t('seekValue', { time: formatMissionTime(time), duration: formatMissionTime(model.duration) })}
					className="absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none opacity-0"
				/>
			</div>

			<SpeedControl speed={speed} onSpeed={onSpeed} />
		</div>
	);
}
