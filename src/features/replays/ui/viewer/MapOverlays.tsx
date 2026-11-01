'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { formatMissionTime } from './format';
import { DeadGlyph, DotGlyph, Icon, UnconsciousGlyph, VehicleGlyph } from './glyphs';
import type { SelectionInfo } from './selection';
import { DEAD_STYLE, NEUTRAL_STYLE, type SideStyle } from './sideStyle';
import { useDismiss } from './useDismiss';
import { DEFAULT_LAYERS, TOGGLE_LAYERS, type MapLayers, type ToggleLayer } from './viewerSettings';

const plate = 'rounded-[4px] border border-[#2c2c2c] bg-[rgba(10,10,10,0.9)]';
const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';
const popover =
	'absolute right-[52px] z-[4] w-[248px] rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]';
const INK = '#141414';
const FIRE = '#c2410c';

export function SelectionCard({
	info,
	following,
	sideStyle,
	sideName,
	onSelect,
	onFollow,
	onClose,
}: {
	info: SelectionInfo;
	following: boolean;
	sideStyle: (side: string | null) => SideStyle;
	sideName: (key: string) => string;
	onSelect: (eid: number) => void;
	onFollow: () => void;
	onClose: () => void;
}) {
	const t = useTranslations('replayViewer');
	const style = sideStyle(info.side);
	const glyph =
		info.kind === 'vehicle' ? (
			<VehicleGlyph style={info.wreck ? DEAD_STYLE : style} />
		) : info.life === 'dead' ? (
			<DeadGlyph size={14} />
		) : info.life === 'unconscious' ? (
			<UnconsciousGlyph style={style} size={14} />
		) : (
			<DotGlyph style={style} size={14} />
		);
	const seat = (role: string) => t(`seat_${role}`);
	const killer = info.kind === 'man' ? info.killer : null;
	const link = 'font-semibold text-neutral-100 underline decoration-[#666666] underline-offset-2 hover:decoration-neutral-100';

	return (
		<section
			aria-label={info.name}
			className="absolute left-[44px] top-[32px] z-[3] w-[288px] max-w-[calc(100%-116px)] rounded-[8px] border border-[#2c2c2c] bg-[rgba(10,10,10,0.94)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
		>
			<div className="flex items-start gap-[10px] py-[10px] pl-[12px] pr-[6px]">
				<span className="mt-[18px] flex">{glyph}</span>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className={`truncate text-neutral-400 ${eyebrow}`}>
						{info.side ? sideName(info.side) : t('noSide')}
						{following ? <span className="text-[color:var(--accent)]"> · {t('following')}</span> : null}
					</span>
					<span className={'line-clamp-2 break-words text-[15px] font-semibold leading-[20px] ' + (info.kind === 'man' && !info.player ? 'text-neutral-300' : 'text-neutral-100')}>
						{info.name}
					</span>
					{info.kind === 'man' && (info.role || info.squad) ? (
						<span className="truncate text-[12px] leading-[16px] text-neutral-400">{[info.role, info.squad].filter(Boolean).join(' · ')}</span>
					) : null}
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label={t('closeCard')}
					className="inline-flex size-[32px] shrink-0 items-center justify-center rounded-[4px] text-neutral-400 hover:bg-[#242424] hover:text-neutral-100"
				>
					<Icon.Close />
				</button>
			</div>

			<div className="flex flex-col gap-[4px] px-[12px] pb-[10px] text-[12px] leading-[16px] text-neutral-300">
				{info.kind === 'man' ? (
					<>
						{info.life === 'dead' ? (
							<span>
								{t('killedAt', { time: formatMissionTime(info.diedAt ?? 0) })}
								{killer ? (
									<span className="block">
										{t.rich('killerLine', {
											who: () => (
												<button type="button" onClick={() => onSelect(killer.eid)} className={link} style={{ color: sideStyle(killer.side).text }}>
													{killer.name}
												</button>
											),
										})}
									</span>
								) : null}
								{info.weapon || info.distance !== null ? (
									<span className="block text-neutral-400">
										{[info.weapon, info.distance !== null ? t('metres', { distance: info.distance }) : null].filter(Boolean).join(' · ')}
									</span>
								) : null}
							</span>
						) : info.life === 'unconscious' ? (
							<span>{t('unconscious')}</span>
						) : null}
						{info.vehicle ? (
							<span>
								<button type="button" onClick={() => info.vehicle && onSelect(info.vehicle.eid)} className={link}>
									{info.vehicle.name}
								</button>
								{', '}
								{seat(info.vehicle.seat)}
							</span>
						) : null}
						{info.kills > 0 ? <span className="tabular-nums">{t('killsSoFar', { count: info.kills })}</span> : null}
					</>
				) : info.wreck ? (
					<span>{t('destroyedAt', { time: formatMissionTime(info.destroyedAt ?? 0) })}</span>
				) : info.crew.length === 0 ? (
					<span className="text-neutral-400">{t('empty')}</span>
				) : (
					<>
						<span className={`text-neutral-400 ${eyebrow}`}>{t('crew', { count: info.crew.length })}</span>
						<ul className="-mx-[6px] flex flex-col">
							{info.crew.map((member) => (
								<li key={member.eid}>
									<button
										type="button"
										onClick={() => onSelect(member.eid)}
										className="flex min-h-[32px] w-full items-center gap-[8px] rounded-[4px] px-[6px] text-left hover:bg-[#1a1a1a]"
									>
										<DotGlyph style={style} size={10} />
										<span className={'min-w-0 flex-1 truncate text-[13px] font-semibold ' + (member.player ? 'text-neutral-100' : 'text-neutral-400')}>{member.name}</span>
										<span className="shrink-0 text-[12px] text-neutral-400">{seat(member.seat)}</span>
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</div>

			<div className="border-t border-[#2c2c2c] p-[8px]">
				<button
					type="button"
					onClick={onFollow}
					aria-pressed={following}
					className={
						'inline-flex min-h-[36px] w-full items-center justify-center gap-[8px] rounded-[4px] border text-[13px] font-semibold ' +
						(following
							? 'border-[rgba(210,184,83,0.5)] bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]'
							: 'border-[#2c2c2c] bg-[#1a1a1a] text-neutral-100 hover:border-[#666666] hover:bg-[#242424]')
					}
				>
					<Icon.Follow size={16} />
					{following ? t('stopFollowing') : t('follow')}
				</button>
			</div>
		</section>
	);
}

function MapButton({ label, onClick, children, pressed, extra = '' }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; extra?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-expanded={pressed}
			className={
				'inline-flex size-[40px] items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)] ' +
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

const MAP_LAYERS: ToggleLayer[] = ['areas', 'fire', 'dead'];
const NAME_LAYERS: ToggleLayer[] = ['nicknames', 'aiRoles', 'squads', 'vehicleNames', 'markerText', 'areaNames'];

/** A side whose markers the game has; a null style is the markers every side could see. */
export type MarkerSide = { key: string; label: string; style: SideStyle | null };

export function MapControls({
	layers,
	onLayers,
	markerSides,
	onZoomIn,
	onZoomOut,
	onFit,
	sample,
}: {
	layers: MapLayers;
	onLayers: (layers: MapLayers) => void;
	markerSides: MarkerSide[];
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFit: () => void;
	/** Two side styles for the legend's examples. */
	sample: [SideStyle, SideStyle];
}) {
	const t = useTranslations('replayViewer');
	const [open, setOpen] = useState<'layers' | 'legend' | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(null), []);
	useDismiss(open !== null, rootRef, close);

	const [a, b] = sample;
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
			t('legend_selected'),
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
		[
			t('legend_area'),
			<svg key="ar" width="28" height="20" viewBox="0 0 28 20">
				<rect x="4" y="4" width="20" height="12" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="4 2.5" />
			</svg>,
		],
	];

	const toggleRow = (key: ToggleLayer) => (
		<label key={key} className="flex min-h-[36px] cursor-pointer items-center gap-[10px] rounded-[4px] px-[8px] hover:bg-[#242424]">
			<input
				type="checkbox"
				checked={layers[key]}
				onChange={(e) => onLayers({ ...layers, [key]: e.target.checked })}
				className="size-[16px] accent-[color:var(--accent)]"
			/>
			<span className="flex-1 text-[13px] leading-[18px] text-neutral-100">{t(`layer_${key}`)}</span>
			{key === 'squads' || key === 'aiRoles' ? <span className="text-[12px] leading-[16px] text-neutral-500">{t(`layerHint_${key}`)}</span> : null}
		</label>
	);
	const markerRow = (side: MarkerSide) => (
		<label key={`markers-${side.key}`} className="flex min-h-[36px] cursor-pointer items-center gap-[10px] rounded-[4px] px-[8px] hover:bg-[#242424]">
			<input
				type="checkbox"
				checked={layers.markerSides.includes(side.key)}
				onChange={(e) =>
					onLayers({
						...layers,
						markerSides: e.target.checked ? [...layers.markerSides, side.key] : layers.markerSides.filter((key) => key !== side.key),
					})
				}
				className="size-[16px] accent-[color:var(--accent)]"
			/>
			<span className="flex-1 text-[13px] leading-[18px] text-neutral-100">{side.label}</span>
			{side.style ? (
				<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
					<path d={diamond(5, 5, 4.5)} fill={side.style.fill} stroke={side.style.edge} strokeWidth="1" />
				</svg>
			) : null}
		</label>
	);
	const atDefaults = TOGGLE_LAYERS.every((key) => layers[key] === DEFAULT_LAYERS[key]) && layers.markerSides.length === 0;

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
			<div className={`flex flex-col overflow-hidden ${open ? 'rounded-[4px] border border-[#2c2c2c] bg-[rgba(10,10,10,0.9)]' : plate}`}>
				<MapButton label={t('layers')} pressed={open === 'layers'} onClick={() => setOpen(open === 'layers' ? null : 'layers')}>
					<Icon.Layers />
				</MapButton>
				<MapButton label={t('legend')} pressed={open === 'legend'} onClick={() => setOpen(open === 'legend' ? null : 'legend')} extra="border-t border-[#2c2c2c]">
					<Icon.Legend />
				</MapButton>
			</div>

			{open === 'layers' ? (
				<div role="group" aria-labelledby="rv-layers-title" className={`${popover} top-[130px]`}>
					<p id="rv-layers-title" className={`px-[8px] pb-[4px] pt-[4px] text-neutral-400 ${eyebrow}`}>
						{t('layersNames')}
					</p>
					{NAME_LAYERS.map(toggleRow)}
					<p className="px-[8px] pb-[4px] pt-[2px] text-[12px] leading-[16px] text-neutral-400">{t('layersNamesHint')}</p>
					<p className={`mt-[6px] border-t border-[#2c2c2c] px-[8px] pb-[4px] pt-[10px] text-neutral-400 ${eyebrow}`}>{t('layersMap')}</p>
					{markerSides.map(markerRow)}
					{MAP_LAYERS.map(toggleRow)}
					<div className="mt-[6px] border-t border-[#2c2c2c] px-[4px] pt-[8px]">
						<button
							type="button"
							onClick={() => onLayers(DEFAULT_LAYERS)}
							disabled={atDefaults}
							className="inline-flex min-h-[32px] w-full items-center justify-center gap-[6px] rounded-[4px] border border-[#2c2c2c] bg-[#121212] text-[13px] font-semibold text-neutral-100 hover:border-[#666666] disabled:cursor-default disabled:border-[#2c2c2c] disabled:text-[#6b6b6b]"
						>
							<Icon.Retry size={14} />
							{t('layersReset')}
						</button>
					</div>
				</div>
			) : null}
			{open === 'legend' ? (
				<div role="group" aria-labelledby="rv-legend-title" className={`${popover} top-[130px] max-h-[calc(100vh-280px)] overflow-y-auto`}>
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
