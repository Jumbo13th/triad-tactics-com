'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { PublicReplayGame } from '../../domain/api';
import { addSegment, emptyModel, positionAt, segmentAt, unixAt, valueAt, type Entity, type ReplayModel } from '../../domain/replayFormat';
import { parseTopo, toLayers } from '../../domain/topo';
import { terrainName } from '../terrainName';
import EventsPanel, { type Who } from './EventsPanel';
import { formatMissionTime } from './format';
import { gameName, loadGameNames, type GameNames } from './gameNames';
import { Icon } from './glyphs';
import MapCanvas, { gridReference, type MapCanvasHandle, type MapLayers } from './MapCanvas';
import { FollowChip, MapControls } from './MapOverlays';
import { NEUTRAL_STYLE, sideStyle as styleOf, type SideStyle } from './sideStyle';
import Timeline from './Timeline';
import { prepareTopo, type PreparedTopo } from './topoDraw';
import UnitsPanel from './UnitsPanel';

const Units = memo(UnitsPanel);
const Events = memo(EventsPanel);

type Load =
	| { state: 'loading'; done: number; total: number; segment: number }
	| { state: 'failed'; segment: number }
	| { state: 'ready'; model: ReplayModel };

const secondary =
	'inline-flex min-h-[44px] items-center justify-center gap-[8px] rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] px-[14px] text-[13px] font-semibold leading-[18px] text-neutral-100 hover:border-[#666666] hover:bg-[#242424] active:bg-[#2e2e2e] disabled:text-[#6b6b6b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const iconOnPhone = 'max-sm:w-[44px] max-sm:border-0 max-sm:bg-transparent max-sm:px-0';
const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';

function fileUrl(sha256: string): string {
	return `/api/replays/files/${sha256}`;
}

function megabytes(bytes: number): string {
	return (bytes / 1_000_000).toFixed(1);
}

class SegmentError extends Error {
	constructor(readonly segment: number) {
		super(`segment_${segment}`);
	}
}

// Segments are read in order: a segment after a crash-resume rolls back what the earlier
// ones recorded past its resume time.
async function loadModel(game: PublicReplayGame, onProgress: (done: number, segment: number) => void): Promise<ReplayModel> {
	const model = emptyModel();
	let done = 0;
	for (const [index, segment] of game.segments.entries()) {
		onProgress(done, index + 1);
		try {
			const res = await fetch(fileUrl(segment.sha256));
			if (!res.ok || !res.body) throw new Error(`status_${res.status}`);
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let text = '';
			for (;;) {
				const { value, done: finished } = await reader.read();
				if (finished) break;
				done += value.byteLength;
				text += decoder.decode(value, { stream: true });
				onProgress(done, index + 1);
			}
			text += decoder.decode();
			addSegment(model, text);
		} catch {
			throw new SegmentError(index + 1);
		}
	}
	return model;
}

function initialTime(): number {
	if (typeof window === 'undefined') return 0;
	const match = /(?:^#|&)t=(\d+)/.exec(window.location.hash);
	return match ? Number(match[1]) * 10 : 0;
}

export default function ReplayViewer({ game }: { game: PublicReplayGame }) {
	const t = useTranslations('replayViewer');
	const locale = useLocale();
	const total = useMemo(() => game.segments.reduce((sum, s) => sum + s.size, 0), [game]);
	const [load, setLoad] = useState<Load>({ state: 'loading', done: 0, total, segment: 1 });
	const [attempt, setAttempt] = useState(0);
	const [names, setNames] = useState<GameNames>({});
	const [relief, setRelief] = useState<HTMLImageElement | null>(null);
	const [topo, setTopo] = useState<PreparedTopo | null>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(16);
	const [follow, setFollow] = useState<number | null>(null);
	const [layers, setLayers] = useState<MapLayers>({ names: true, fire: true, markers: true, areas: true, dead: true });
	const [tab, setTab] = useState<'units' | 'events'>('events');
	const [copied, setCopied] = useState(false);
	const mapRef = useRef<MapCanvasHandle>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const model = await loadModel(game, (done, segment) => {
					if (!cancelled) setLoad({ state: 'loading', done, total, segment });
				});
				if (cancelled) return;
				setLoad({ state: 'ready', model });
				setTime(Math.min(initialTime(), model.duration));
			} catch (error) {
				if (!cancelled) setLoad({ state: 'failed', segment: error instanceof SegmentError ? error.segment : 1 });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [game, total, attempt]);

	useEffect(() => {
		let cancelled = false;
		void loadGameNames(locale).then((loaded) => {
			if (!cancelled) setNames(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, [locale]);

	useEffect(() => {
		if (!game.map.relief) return;
		const image = new Image();
		image.onload = () => setRelief(image);
		image.src = fileUrl(game.map.relief);
	}, [game.map.relief]);

	const model = load.state === 'ready' ? load.model : null;

	// The geometry stores map y = terrain size - z; the recording's bounds give that size. The map
	// works without it, so a failure here only leaves the relief bare.
	useEffect(() => {
		if (!game.map.topo || !model) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(fileUrl(game.map.topo as string));
				if (!res.ok || cancelled) return;
				const map = parseTopo(await res.arrayBuffer());
				const terrainSize = model.bounds[3] > 0 ? model.bounds[3] : undefined;
				const fine = toLayers(map, { terrainSize, lod: 0 });
				const coarse = toLayers({ ...map, areas: null }, { terrainSize, lod: 3 });
				if (!cancelled) setTopo(prepareTopo(fine, coarse));
			} catch {
				// Left without vector layers.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [game.map.topo, model]);

	useEffect(() => {
		if (!playing || !model) return;
		let last = performance.now();
		let frame = 0;
		const step = (now: number) => {
			const elapsed = now - last;
			last = now;
			// 1× plays one tenth of mission time per 100 ms of real time.
			setTime((previous) => {
				const next = previous + (elapsed / 100) * speed;
				if (next >= model.duration) {
					setPlaying(false);
					return model.duration;
				}
				return next;
			});
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [playing, speed, model]);

	const second = Math.floor(time / 10);
	// At high speed the lists would redraw dozens of times a second; a few times is enough.
	const listStep = playing ? Math.max(1, Math.round(speed / 4)) : 1;
	const listSecond = Math.floor(second / listStep) * listStep;

	const sideColors = useMemo(() => new Map((model?.sides ?? []).map((side) => [side.key, side.color])), [model]);
	const sideStyle = useCallback(
		(side: string | null): SideStyle => {
			const color = side ? sideColors.get(side) : undefined;
			return color ? styleOf(color) : NEUTRAL_STYLE;
		},
		[sideColors]
	);
	const sideName = useCallback((key: string) => gameName(names, model?.sides.find((side) => side.key === key)?.name ?? key), [names, model]);
	const callsignFor = useCallback(
		(groupKey: string) => {
			const callsign = model?.groups.get(groupKey)?.callsign;
			return callsign ? gameName(names, callsign) : '—';
		},
		[names, model]
	);

	// Who controls which body: a player's name wins over the slot's role.
	const playerName = useCallback(
		(eid: number, at: number) => {
			if (!model) return null;
			for (const player of model.players.values()) {
				if (valueAt(player.controls, at, null) === eid) return valueAt(player.names, at, '') || null;
			}
			return null;
		},
		[model]
	);
	const roleName = useCallback((entity: Entity) => gameName(names, entity.name), [names]);
	const vehicleName = useCallback(
		(eid: number) => {
			const vehicle = model?.entities.get(eid);
			return vehicle ? gameName(names, vehicle.name) : '';
		},
		[names, model]
	);
	const who = useCallback<Who>(
		(eid, at) => {
			const entity = eid !== null ? model?.entities.get(eid) : undefined;
			if (!entity) return null;
			return { name: playerName(entity.eid, at) ?? gameName(names, entity.name), side: entity.side, vehicle: entity.kind !== 'man' };
		},
		[model, names, playerName]
	);
	const weaponName = useCallback(
		(wid: number | null) => {
			const weapon = wid !== null ? model?.weapons.get(wid) : undefined;
			return weapon ? gameName(names, weapon.name) : null;
		},
		[model, names]
	);
	const zoneName = useCallback((zid: number) => model?.zones.get(zid)?.label ?? String(zid), [model]);
	const translate = useCallback((value: string) => gameName(names, value), [names]);

	const controllers = useMemo(() => {
		const map = new Map<number, string>();
		if (!model) return map;
		for (const player of model.players.values()) {
			const eid = valueAt(player.controls, second * 10, null);
			const name = valueAt(player.names, second * 10, '');
			if (eid !== null && name) map.set(eid, name);
		}
		return map;
	}, [model, second]);
	const labelFor = useCallback((entity: Entity) => controllers.get(entity.eid) ?? gameName(names, entity.name), [controllers, names]);

	const onFollow = useCallback((eid: number | null) => setFollow(eid), []);
	const onFollowEntity = useCallback((eid: number) => setFollow((current) => (current === eid ? null : eid)), []);
	const onSeek = useCallback((at: number) => setTime(at), []);

	const realTime = useMemo(() => {
		if (!model) return null;
		const unix = unixAt(model, second * 10);
		return unix === null ? null : new Date(unix * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
	}, [model, second, locale]);

	const copyLink = async () => {
		const url = `${window.location.origin}${window.location.pathname}#t=${second}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			window.location.hash = `t=${second}`;
		}
	};

	const followed = follow !== null ? model?.entities.get(follow) : undefined;
	const followDetail = (() => {
		if (!model || !followed) return '';
		const at = second * 10;
		const seat = valueAt(followed.seats, at, null);
		const position = positionAt((seat && model.entities.get(seat.vehicle)) || followed, at);
		const grid = position ? gridReference(position.x, position.z) : null;
		if (followed.kind !== 'man') return [followed.side ? sideName(followed.side) : null, grid].filter(Boolean).join(' · ');
		const group = followed.groups.get(segmentAt(model, at));
		// Without a player the name already is the role.
		const role = roleName(followed);
		const parts = [role === labelFor(followed) ? null : role, group ? callsignFor(group) : null];
		if (seat) parts.push(t('inVehicle', { vehicle: vehicleName(seat.vehicle), role: t(`seat_${seat.role}`) }));
		parts.push(grid);
		return parts.filter(Boolean).join(' · ');
	})();

	const terrain = terrainName(game.world);
	const inGameDate =
		model?.date && model.date.length >= 3
			? new Date(Date.UTC(model.date[0], model.date[1] - 1, model.date[2], model.date[3] ?? 0, model.date[4] ?? 0)).toLocaleString(locale, {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'UTC',
				})
			: null;
	const meta = [t('episode', { episode: game.episodeNumber }), terrain, inGameDate ? t('inGame', { date: inGameDate }) : null].filter(Boolean) as string[];
	const sample = useMemo<[SideStyle, SideStyle]>(() => {
		const styles = (model?.sides ?? []).map((side) => styleOf(side.color));
		return [styles[0] ?? NEUTRAL_STYLE, styles[1] ?? styles[0] ?? NEUTRAL_STYLE];
	}, [model]);
	const progress = load.state === 'loading' && total > 0 ? Math.min(100, (load.done / total) * 100) : 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-[12px] text-[14px] leading-[20px]">
			{/* On a phone this is the page's only bar, one row: back, title, and icon buttons. */}
			<header className="flex min-h-[56px] items-center gap-x-[4px] gap-y-[8px] sm:flex-wrap sm:gap-x-[16px]">
				<Link
					href="/replays"
					locale={locale}
					aria-label={t('backToReplays')}
					className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-[6px] rounded-[4px] text-[13px] font-semibold leading-[18px] text-neutral-300 hover:bg-[#1a1a1a] hover:text-neutral-100 sm:pl-[6px] sm:pr-[12px]"
				>
					<Icon.ChevronLeft size={18} />
					<span className="hidden sm:inline">{t('back')}</span>
				</Link>
				<span aria-hidden="true" className="hidden h-[32px] w-px bg-[#2c2c2c] sm:block" />
				<div className="flex min-w-0 flex-1 flex-col gap-[2px] sm:flex-[1_1_320px]">
					<h1 className="truncate text-[16px] font-semibold leading-[22px] tracking-[-0.01em] text-neutral-100 sm:text-[20px] sm:leading-[28px]">
						{game.missionTitle}
					</h1>
					<p className="flex items-center gap-x-[8px] gap-y-[2px] overflow-hidden whitespace-nowrap text-[12px] leading-[16px] text-neutral-400 sm:flex-wrap sm:whitespace-normal sm:text-[13px] sm:leading-[18px]">
						{meta.map((part, i) => (
							<span key={i} className="flex items-center gap-x-[8px]">
								{i > 0 ? (
									<span aria-hidden="true" className="text-[#666666]">
										·
									</span>
								) : null}
								{part}
							</span>
						))}
					</p>
				</div>
				<div className="flex shrink-0 gap-[4px] sm:flex-wrap sm:gap-[8px]">
					{game.statsId !== null ? (
						<Link href={`/stats/games/${game.statsId}`} locale={locale} aria-label={t('statistics')} className={`${secondary} ${iconOnPhone}`}>
							<span className="flex text-neutral-400">
								<Icon.Chart size={18} />
							</span>
							<span className="hidden sm:inline">{t('statistics')}</span>
						</Link>
					) : null}
					<button
						type="button"
						onClick={() => void copyLink()}
						disabled={!model}
						aria-label={copied ? t('linkCopied') : t('copyLink', { time: formatMissionTime(time) })}
						className={`${secondary} ${iconOnPhone}`}
					>
						<span className="flex text-neutral-400">{copied ? <Icon.Check size={18} /> : <Icon.Link size={18} />}</span>
						<span className="hidden tabular-nums sm:inline">{copied ? t('linkCopied') : t('copyLink', { time: formatMissionTime(time) })}</span>
					</button>
				</div>
			</header>

			<section
				aria-label={t('replay')}
				className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[8px] border border-[#2c2c2c] bg-[#121212] lg:min-h-[560px] lg:max-h-[1080px] lg:flex-1 lg:basis-0 lg:grid-cols-[288px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)_auto]"
			>
				<section aria-label={t('mapLabel')} className="relative row-start-1 h-[62vh] min-h-[420px] min-w-0 overflow-hidden bg-[#c4e7ed] lg:col-start-2 lg:h-auto lg:min-h-0">
					{model ? (
						<>
							<MapCanvas
								model={model}
								t={time}
								relief={relief}
								topo={topo}
								follow={follow}
								layers={layers}
								sideStyle={sideStyle}
								labelFor={labelFor}
								callsignFor={callsignFor}
								contested={t('contested')}
								onFollow={onFollow}
								handleRef={mapRef}
								ariaLabel={t('mapLabel')}
							/>
							{followed ? <FollowChip name={labelFor(followed)} detail={followDetail} onStop={() => setFollow(null)} /> : null}
							<MapControls
								layers={layers}
								onLayers={setLayers}
								onZoomIn={() => mapRef.current?.zoom(1.5)}
								onZoomOut={() => mapRef.current?.zoom(1 / 1.5)}
								onFit={() => {
									setFollow(null);
									mapRef.current?.fit();
								}}
								sample={sample}
							/>
						</>
					) : load.state === 'failed' ? (
						<div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-[12px] bg-[#121212] p-[24px] text-center">
							<span className="flex text-neutral-400">
								<Icon.Warning />
							</span>
							<div className="flex flex-col gap-[4px]">
								<span className="text-[16px] font-semibold leading-[22px] text-neutral-100">{t('loadFailed')}</span>
								<span className="text-[13px] leading-[18px] text-neutral-400">{t('segmentFailed', { segment: load.segment, segments: game.segments.length })}</span>
							</div>
							<div className="flex flex-wrap justify-center gap-[8px]">
								<button
									type="button"
									onClick={() => {
										setLoad({ state: 'loading', done: 0, total, segment: 1 });
										setAttempt((n) => n + 1);
									}}
									className="inline-flex min-h-[44px] items-center gap-[8px] rounded-[4px] bg-[color:var(--accent)] px-[16px] text-[13px] font-semibold leading-[18px] text-[#0a0a0a] hover:bg-[#dcc56c] active:bg-[#bca243]"
								>
									<Icon.Retry />
									{t('retry')}
								</button>
								<Link href="/replays" locale={locale} className={secondary}>
									{t('backToReplays')}
								</Link>
							</div>
						</div>
					) : (
						<>
							{game.map.relief ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img src={fileUrl(game.map.relief)} alt="" className="absolute inset-0 size-full object-cover" />
							) : null}
							<div
								role="status"
								className="absolute left-1/2 top-1/2 flex w-[392px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[12px] rounded-[8px] border border-[#2c2c2c] bg-[#121212] p-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
							>
								<div className="flex flex-col gap-[4px]">
									<span className={`text-neutral-400 ${eyebrow}`}>{t('loadingTitle')}</span>
									<span className="text-[16px] font-semibold leading-[22px] text-neutral-100">
										{t('loading', { segment: load.state === 'loading' ? load.segment : 1, segments: game.segments.length })}
									</span>
								</div>
								<div className="flex flex-col gap-[6px]">
									<div
										role="progressbar"
										aria-label={t('loadingTitle')}
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={Math.round(progress)}
										className="h-[4px] overflow-hidden rounded-[2px] bg-[#333333]"
									>
										<div className="h-[4px] bg-[color:var(--accent)] transition-[width]" style={{ width: `${progress}%` }} />
									</div>
									<div className="flex justify-between text-[12px] leading-[16px] tabular-nums text-neutral-400">
										<span>{t('loadedOf', { done: megabytes(load.state === 'loading' ? load.done : 0), total: megabytes(total) })}</span>
										<span>{Math.round(progress)} %</span>
									</div>
								</div>
							</div>
						</>
					)}
				</section>

				<div className="row-start-2 min-w-0 lg:col-span-3">
					{model ? (
						<Timeline
							model={model}
							time={time}
							playing={playing}
							speed={speed}
							realTime={realTime}
							sideStyle={sideStyle}
							sideName={sideName}
							zoneName={zoneName}
							onTogglePlay={() => {
								if (!playing && time >= model.duration) setTime(0);
								setPlaying((value) => !value);
							}}
							onSpeed={setSpeed}
							onSeek={onSeek}
						/>
					) : null}
				</div>

				{model ? (
					<>
						<div role="tablist" aria-label={t('lists')} className="row-start-3 grid grid-cols-2 gap-[4px] border-t border-[#2c2c2c] px-[16px] pt-[8px] lg:hidden">
							{(['units', 'events'] as const).map((value) => (
								<button
									key={value}
									type="button"
									role="tab"
									aria-selected={tab === value}
									onClick={() => setTab(value)}
									className={
										'min-h-[44px] rounded-[4px] border px-[10px] text-[13px] font-semibold leading-[18px] ' +
										(tab === value
											? 'border-[rgba(210,184,83,0.5)] bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]'
											: 'border-[#2c2c2c] bg-[#1a1a1a] text-neutral-300')
									}
								>
									{t(value)}
								</button>
							))}
						</div>
						<aside
							aria-label={t('units')}
							className={
								(tab === 'units' ? 'flex' : 'hidden') +
								' row-start-4 h-[70vh] min-h-0 flex-col lg:col-start-1 lg:row-start-1 lg:flex lg:h-auto lg:border-r lg:border-[#2c2c2c]'
							}
						>
							<Units
								model={model}
								second={listSecond}
								follow={follow}
								sideName={sideName}
								sideStyle={sideStyle}
								callsignFor={callsignFor}
								playerName={playerName}
								roleName={roleName}
								vehicleName={vehicleName}
								onFollow={onFollowEntity}
							/>
						</aside>
						<aside
							aria-label={t('events')}
							className={
								(tab === 'events' ? 'flex' : 'hidden') +
								' row-start-4 h-[70vh] min-h-0 flex-col lg:col-start-3 lg:row-start-1 lg:flex lg:h-auto lg:border-l lg:border-[#2c2c2c]'
							}
						>
							<Events
								model={model}
								second={listSecond}
								playing={playing}
								who={who}
								weaponName={weaponName}
								sideName={sideName}
								sideStyle={sideStyle}
								zoneName={zoneName}
								translate={translate}
								onSeek={onSeek}
							/>
						</aside>
					</>
				) : (
					<>
						<div aria-hidden="true" className="hidden lg:col-start-1 lg:row-start-1 lg:block lg:border-r lg:border-[#2c2c2c]" />
						<div aria-hidden="true" className="hidden lg:col-start-3 lg:row-start-1 lg:block lg:border-l lg:border-[#2c2c2c]" />
					</>
				)}
			</section>
		</div>
	);
}
