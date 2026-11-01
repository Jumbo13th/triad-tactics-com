'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './glyphs';
import type { MapLayers } from './MapCanvas';
import { DEAD_STYLE, NEUTRAL_STYLE, type SideStyle } from './sideStyle';

const plate = 'rounded-[4px] border border-[#2c2c2c] bg-[rgba(10,10,10,0.9)]';
const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';
const popover =
	'absolute right-[52px] z-[4] w-[248px] rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]';
const INK = '#141414';
const FIRE = '#c2410c';

export function FollowChip({ name, detail, onStop }: { name: string; detail: string; onStop: () => void }) {
	const t = useTranslations('replayViewer');
	return (
		<div className={`absolute left-[44px] top-[32px] z-[3] flex max-w-[calc(100%-116px)] items-center gap-[10px] py-[6px] pl-[12px] pr-[6px] ${plate}`}>
			<span className="flex text-[color:var(--accent)]">
				<Icon.Follow />
			</span>
			<div className="flex min-w-0 flex-col">
				<span className={`text-[color:var(--accent)] ${eyebrow}`}>{t('following')}</span>
				<span className="truncate text-[13px] font-semibold leading-[18px] text-neutral-100">{name}</span>
				<span className="truncate text-[12px] leading-[16px] tabular-nums text-neutral-400">{detail}</span>
			</div>
			<button
				type="button"
				onClick={onStop}
				aria-label={t('stopFollowing')}
				className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-[4px] bg-[#1a1a1a] text-neutral-300 hover:bg-[#242424] hover:text-neutral-100"
			>
				<Icon.Close />
			</button>
		</div>
	);
}

function MapButton({ label, onClick, children, pressed, extra = '' }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; extra?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			aria-expanded={pressed}
			className={
				'inline-flex size-[44px] items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)] ' +
				(pressed ? 'text-[color:var(--accent)]' : 'text-neutral-100 hover:bg-[#262626]') +
				' ' +
				extra
			}
		>
			{children}
		</button>
	);
}

function Tile({ children }: { children: ReactNode }) {
	return (
		<span aria-hidden="true" className="inline-flex h-[20px] w-[28px] shrink-0 items-center justify-center rounded-[2px] bg-[#e6e6e6]">
			{children}
		</span>
	);
}

const diamond = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;

export function MapControls({
	layers,
	onLayers,
	onZoomIn,
	onZoomOut,
	onFit,
	sample,
}: {
	layers: MapLayers;
	onLayers: (layers: MapLayers) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
	/** Two side styles for the legend's examples. */
	sample: [SideStyle, SideStyle];
}) {
	const t = useTranslations('replayViewer');
	const [open, setOpen] = useState<'layers' | 'legend' | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(null);
		};
		const onDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onDown);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onDown);
		};
	}, [open]);

	const [a, b] = sample;
	const previews: Record<keyof MapLayers, ReactNode> = {
		names: <span className="rounded-[2px] bg-[rgba(10,10,10,0.86)] px-[3px] text-[9px] font-semibold leading-[12px] text-neutral-100">Aa</span>,
		fire: (
			<svg width="22" height="14" viewBox="0 0 22 14">
				<line x1="2" y1="11" x2="11" y2="5" stroke={FIRE} strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="16" cy="7" r="4" fill={FIRE} fillOpacity="0.18" stroke={FIRE} strokeWidth="1.5" />
			</svg>
		),
		markers: (
			// eslint-disable-next-line @next/next/no-img-element
			<img src="/markers/icons/exclamation-yellow.png" alt="" width={18} height={18} />
		),
		areas: (
			<svg width="22" height="14" viewBox="0 0 22 14">
				<rect x="2" y="2" width="18" height="10" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="4 2.5" />
			</svg>
		),
		dead: (
			<svg width="22" height="14" viewBox="0 0 22 14">
				<circle cx="6" cy="7" r="3" fill={DEAD_STYLE.fill} stroke={DEAD_STYLE.edge} strokeWidth="1" />
				<path d={diamond(15, 7, 5)} fill={DEAD_STYLE.fill} stroke={DEAD_STYLE.edge} strokeWidth="1" />
			</svg>
		),
	};

	const soldier = (style: SideStyle) => {
		const r = 4.5;
		const d = 8.5;
		const k = Math.acos(r / d);
		const px = r * Math.sin(k);
		const py = -r * Math.cos(k);
		return <path d={`M0 ${-d}L${px} ${py}A${r} ${r} 0 1 1 ${-px} ${py}Z`} transform="translate(14 11) rotate(60)" fill={style.fill} stroke={style.edge} strokeWidth="1.25" strokeLinejoin="round" />;
	};
	const legend: [string, ReactNode][] = [
		[t('legend_soldier'), <svg key="s" width="28" height="20" viewBox="0 0 28 20">{soldier(a)}</svg>],
		[
			t('legend_unconscious'),
			<svg key="u" width="28" height="20" viewBox="0 0 28 20">
				<circle cx="14" cy="10" r="5.5" fill="none" stroke={a.edge} strokeWidth="1" />
				<circle cx="14" cy="10" r="4" fill="#ffffff" stroke={a.fill} strokeWidth="2" />
			</svg>,
		],
		[
			t('legend_corpse'),
			<svg key="c" width="28" height="20" viewBox="0 0 28 20">
				<circle cx="14" cy="10" r="3" fill={DEAD_STYLE.fill} stroke={DEAD_STYLE.edge} strokeWidth="1" />
			</svg>,
		],
		[
			t('legend_squad'),
			<svg key="q" width="28" height="20" viewBox="0 0 28 20">
				<path d={diamond(14, 10, 8)} fill={a.fill} stroke={a.edge} strokeWidth="1.25" />
				<path d="M10 6L18 14M18 6L10 14" stroke={a.edge} strokeWidth="1" />
			</svg>,
		],
		[
			t('legend_vehicle'),
			<svg key="v" width="28" height="20" viewBox="0 0 28 20">
				<path d={diamond(11, 11, 8)} fill={b.fill} stroke={b.edge} strokeWidth="1.25" />
				<ellipse cx="11" cy="11" rx="3.4" ry="1.9" fill="none" stroke={b.edge} strokeWidth="1" />
				<rect x="17" y="1" width="9" height="9" rx="1.5" fill="#0a0a0a" stroke="#ffffff" strokeWidth="0.75" />
				<text x="21.5" y="8" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffffff">
					3
				</text>
			</svg>,
		],
		[
			t('legend_wreck'),
			<svg key="w" width="28" height="20" viewBox="0 0 28 20">
				<path d={diamond(14, 10, 7)} fill={DEAD_STYLE.fill} stroke={DEAD_STYLE.edge} strokeWidth="1.25" />
				<ellipse cx="14" cy="10" rx="2.8" ry="1.6" fill="none" stroke={DEAD_STYLE.edge} strokeWidth="1" />
			</svg>,
		],
		[
			t('legend_followed'),
			<svg key="f" width="28" height="20" viewBox="0 0 28 20">
				<path d="M7 7V3h4M17 3h4v4M21 13v4h-4M11 17H7v-4" fill="none" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="square" />
				<path d="M7 7V3h4M17 3h4v4M21 13v4h-4M11 17H7v-4" fill="none" stroke="#d2b853" strokeWidth="1.5" strokeLinecap="square" />
			</svg>,
		],
		[
			t('legend_kill'),
			<svg key="k" width="28" height="20" viewBox="0 0 28 20">
				<line x1="4" y1="15" x2="23" y2="5" stroke={a.edge} strokeWidth="1.5" strokeLinecap="round" />
				<line x1="4" y1="15" x2="11" y2="11" stroke={FIRE} strokeWidth="1.5" strokeLinecap="round" />
			</svg>,
		],
		[
			t('legend_blast'),
			<svg key="b" width="28" height="20" viewBox="0 0 28 20">
				<circle cx="14" cy="10" r="6" fill={FIRE} fillOpacity="0.18" stroke={FIRE} strokeWidth="1.5" />
			</svg>,
		],
		[
			t('legend_zoneHeld'),
			<svg key="zh" width="28" height="20" viewBox="0 0 28 20">
				<path d="M4 6L14 3L24 6L22 16L6 16Z" fill={a.fill} fillOpacity="0.22" stroke={a.edge} strokeWidth="1.5" />
			</svg>,
		],
		[
			t('legend_zoneContested'),
			<svg key="zc" width="28" height="20" viewBox="0 0 28 20">
				<defs>
					<pattern id="rv-legend-stripes" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect width="2" height="4" fill={a.fill} fillOpacity="0.5" />
						<rect x="2" width="2" height="4" fill={b.fill} fillOpacity="0.5" />
					</pattern>
				</defs>
				<path d="M4 6L14 3L24 6L22 16L6 16Z" fill="url(#rv-legend-stripes)" stroke={b.edge} strokeWidth="1.5" strokeDasharray="3 2" />
			</svg>,
		],
		[
			t('legend_zoneFree'),
			<svg key="zf" width="28" height="20" viewBox="0 0 28 20">
				<path d="M4 6L14 3L24 6L22 16L6 16Z" fill={NEUTRAL_STYLE.fill} fillOpacity="0.16" stroke={NEUTRAL_STYLE.edge} strokeWidth="1.5" strokeDasharray="3 2" />
			</svg>,
		],
	];

	return (
		<div ref={rootRef} className="absolute right-[12px] top-[32px] z-[3] flex flex-col items-end gap-[8px]">
			<div className={`flex flex-col overflow-hidden ${plate}`}>
				<MapButton label={t('zoomIn')} onClick={onZoomIn}>
					<Icon.Plus />
				</MapButton>
				<MapButton label={t('zoomOut')} onClick={onZoomOut} extra="border-t border-[#2c2c2c]">
					<Icon.Minus />
				</MapButton>
				<MapButton label={t('fit')} onClick={onFit} extra="border-t border-[#2c2c2c]">
					<Icon.Fit />
				</MapButton>
			</div>
			<div className={open === 'layers' ? 'rounded-[4px] border border-[rgba(210,184,83,0.5)] bg-[#29261a]' : plate}>
				<MapButton label={t('layers')} pressed={open === 'layers'} onClick={() => setOpen(open === 'layers' ? null : 'layers')}>
					<Icon.Layers />
				</MapButton>
			</div>
			<div className={open === 'legend' ? 'rounded-[4px] border border-[rgba(210,184,83,0.5)] bg-[#29261a]' : plate}>
				<MapButton label={t('legend')} pressed={open === 'legend'} onClick={() => setOpen(open === 'legend' ? null : 'legend')}>
					<Icon.Legend />
				</MapButton>
			</div>

			{open === 'layers' ? (
				<fieldset className={`${popover} top-[144px]`}>
					<legend className={`float-left w-full px-[8px] pb-[6px] pt-[4px] text-neutral-400 ${eyebrow}`}>{t('layers')}</legend>
					{(Object.keys(previews) as (keyof MapLayers)[]).map((key) => (
						<label key={key} className="clear-left flex min-h-[44px] cursor-pointer items-center gap-[10px] rounded-[4px] px-[8px] hover:bg-[#242424]">
							<input
								type="checkbox"
								checked={layers[key]}
								onChange={(e) => onLayers({ ...layers, [key]: e.target.checked })}
								className="size-[16px] accent-[color:var(--accent)]"
							/>
							<span className="flex-1 text-[13px] leading-[18px] text-neutral-100">{t(`layer_${key}`)}</span>
							<Tile>{previews[key]}</Tile>
						</label>
					))}
				</fieldset>
			) : null}
			{open === 'legend' ? (
				<div role="group" aria-labelledby="rv-legend-title" className={`${popover} top-[196px] max-h-[calc(100vh-320px)] overflow-y-auto`}>
					<p id="rv-legend-title" className={`px-[8px] pb-[6px] pt-[4px] text-neutral-400 ${eyebrow}`}>
						{t('legend')}
					</p>
					<ul>
						{legend.map(([label, symbol]) => (
							<li key={label} className="flex min-h-[32px] items-center gap-[10px] px-[8px]">
								<Tile>{symbol}</Tile>
								<span className="text-[13px] leading-[18px] text-neutral-100">{label}</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
