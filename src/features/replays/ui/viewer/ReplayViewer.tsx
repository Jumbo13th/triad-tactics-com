'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { PublicReplayGame } from '../../domain/api';
import { addSegment, emptyModel, unixAt, valueAt, type Entity, type ReplayModel } from '../../domain/replayFormat';
import { terrainName } from '../terrainName';
import EventsPanel from './EventsPanel';
import { formatMissionTime } from './format';
import { gameName, loadGameNames, type GameNames } from './gameNames';
import MapCanvas, { type MapCanvasHandle, type MapLayers } from './MapCanvas';
import { readableOnDark } from './readableColor';
import Timeline from './Timeline';
import type { TopoLayers } from './topoDraw';
import UnitsPanel from './UnitsPanel';

const Units = memo(UnitsPanel);
const Events = memo(EventsPanel);
const NEUTRAL = '#8b95a1';

type Load = { state: 'loading'; done: number; total: number; segment: number } | { state: 'failed' } | { state: 'ready'; model: ReplayModel };

function fileUrl(sha256: string): string {
	return `/api/replays/files/${sha256}`;
}

// Segments are read in order: a segment after a crash-resume rolls back what the earlier
// ones recorded past its resume time.
async function loadModel(game: PublicReplayGame, onProgress: (done: number, segment: number) => void): Promise<ReplayModel> {
	const model = emptyModel();
	let done = 0;
	for (const [index, segment] of game.segments.entries()) {
		onProgress(done, index + 1);
		const res = await fetch(fileUrl(segment.sha256));
		if (!res.ok || !res.body) throw new Error(`segment_${res.status}`);
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
	const [topo] = useState<TopoLayers | null>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(16);
	const [follow, setFollow] = useState<number | null>(null);
	const [layers, setLayers] = useState<MapLayers>({ names: true, fire: true, markers: true, areas: true });
	const [tab, setTab] = useState<'units' | 'events'>('events');
	const [layersOpen, setLayersOpen] = useState(false);
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
			} catch {
				if (!cancelled) setLoad({ state: 'failed' });
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

	const sideColors = useMemo(() => new Map((model?.sides ?? []).map((side) => [side.key, side.color])), [model]);
	const sideColor = useCallback((side: string | null) => (side ? (sideColors.get(side) ?? NEUTRAL) : NEUTRAL), [sideColors]);
	const sideName = useCallback(
		(key: string) => gameName(names, model?.sides.find((side) => side.key === key)?.name ?? key),
		[names, model]
	);
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
	const who = useCallback(
		(eid: number | null, at: number) => {
			const entity = eid !== null ? model?.entities.get(eid) : undefined;
			if (!entity) return null;
			return { name: playerName(entity.eid, at) ?? gameName(names, entity.name), color: readableOnDark(sideColor(entity.side)) };
		},
		[model, names, playerName, sideColor]
	);
	const weaponName = useCallback(
		(wid: number | null) => {
			const weapon = wid !== null ? model?.weapons.get(wid) : undefined;
			return weapon ? gameName(names, weapon.name) : null;
		},
		[model, names]
	);
	const zoneName = useCallback((zid: number) => model?.zones.get(zid)?.label ?? String(zid), [model]);

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
	const terrain = terrainName(game.world);
	const inGameDate =
		model?.date && model.date.length >= 3
			? new Date(Date.UTC(model.date[0], model.date[1] - 1, model.date[2], model.date[3] ?? 0, model.date[4] ?? 0)).toLocaleString(locale, {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'UTC',
				})
			: null;

	return (
		<div className="relative left-1/2 w-[calc(100vw-1.5rem)] max-w-[1600px] -translate-x-1/2">
			<header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
				<Link
					href="/replays"
					locale={locale}
					className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-neutral-400 hover:text-neutral-100"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M15 18l-6-6 6-6" />
					</svg>
					{t('back')}
				</Link>
				<div className="min-w-[12rem] flex-1">
					<h1 className="truncate text-lg font-semibold tracking-tight text-neutral-50 sm:text-xl">{game.missionTitle}</h1>
					<p className="text-xs text-neutral-400">
						{[t('episode', { episode: game.episodeNumber }), terrain, inGameDate].filter(Boolean).join(' · ')}
					</p>
				</div>
				{game.statsId !== null ? (
					<Link
						href={`/stats/games/${game.statsId}`}
						locale={locale}
						className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-neutral-50 hover:bg-white/15"
					>
						{t('statistics')}
					</Link>
				) : null}
				<button
					type="button"
					onClick={() => void copyLink()}
					disabled={!model}
					className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-3 text-sm font-semibold text-neutral-50 hover:bg-white/15 disabled:opacity-50"
				>
					{copied ? t('linkCopied') : t('copyLink', { time: formatMissionTime(time) })}
				</button>
			</header>

			<div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
				<div className="grid lg:h-[min(76vh,880px)] lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
					<aside aria-label={t('units')} className="hidden min-h-0 border-r border-neutral-800 lg:block">
						{model ? (
							<Units
								model={model}
								second={second}
								follow={follow}
								sideName={sideName}
								sideColor={sideColor}
								callsignFor={callsignFor}
								playerName={playerName}
								roleName={roleName}
								vehicleName={vehicleName}
								onFollow={onFollowEntity}
							/>
						) : null}
					</aside>

					<div className="relative h-[58vh] min-h-[420px] lg:h-auto">
						{model ? (
							<>
								<MapCanvas
									model={model}
									t={time}
									relief={relief}
									topo={topo}
									follow={follow}
									layers={layers}
									sideColor={sideColor}
									labelFor={labelFor}
									callsignFor={callsignFor}
									onFollow={onFollow}
									handleRef={mapRef}
									ariaLabel={t('mapLabel')}
								/>
								{followed ? (
									<div className="absolute left-3 top-3 flex max-w-[calc(100%-6rem)] items-center gap-2 rounded-xl bg-neutral-950/90 py-1 pl-3 pr-1 text-sm text-neutral-100">
										<span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent)]" />
										<span className="truncate">
											<span className="font-semibold">{t('following')}</span> {labelFor(followed)}
										</span>
										<button
											type="button"
											onClick={() => setFollow(null)}
											aria-label={t('stopFollowing')}
											className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-300 hover:bg-white/15"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
												<path d="M6 6l12 12M18 6L6 18" />
											</svg>
										</button>
									</div>
								) : null}
								<div className="absolute right-3 top-3 flex flex-col items-end gap-2">
									<div className="flex flex-col overflow-hidden rounded-xl bg-neutral-950/90">
										<button type="button" onClick={() => mapRef.current?.zoom(1.5)} aria-label={t('zoomIn')} className="h-11 w-11 text-xl text-neutral-100 hover:bg-white/10">
											+
										</button>
										<button
											type="button"
											onClick={() => mapRef.current?.zoom(1 / 1.5)}
											aria-label={t('zoomOut')}
											className="h-11 w-11 border-t border-neutral-800 text-xl text-neutral-100 hover:bg-white/10"
										>
											−
										</button>
										<button
											type="button"
											onClick={() => {
												setFollow(null);
												mapRef.current?.fit();
											}}
											aria-label={t('fit')}
											className="flex h-11 w-11 items-center justify-center border-t border-neutral-800 text-neutral-100 hover:bg-white/10"
										>
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
												<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
											</svg>
										</button>
									</div>
									<button
										type="button"
										onClick={() => setLayersOpen((open) => !open)}
										aria-expanded={layersOpen}
										aria-label={t('layers')}
										className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-950/90 text-neutral-100 hover:bg-neutral-900"
									>
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
											<path d="M12 3l9 5-9 5-9-5 9-5z" />
											<path d="M3 13l9 5 9-5" />
										</svg>
									</button>
									{layersOpen ? (
									<fieldset className="flex flex-col gap-0.5 rounded-xl bg-neutral-950/90 p-1.5 text-xs font-semibold text-neutral-100">
										<legend className="sr-only">{t('layers')}</legend>
										{(['names', 'fire', 'markers', 'areas'] as const).map((key) => (
											<label key={key} className="flex min-h-8 cursor-pointer items-center gap-2 px-2">
												<input
													type="checkbox"
													checked={layers[key]}
													onChange={(e) => setLayers((current) => ({ ...current, [key]: e.target.checked }))}
													className="accent-[color:var(--accent)]"
												/>
												{t(`layer_${key}`)}
											</label>
										))}
									</fieldset>
									) : null}
								</div>
							</>
						) : load.state === 'failed' ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
								<p className="text-sm text-neutral-300">{t('loadFailed')}</p>
								<button
									type="button"
									onClick={() => {
										setLoad({ state: 'loading', done: 0, total, segment: 1 });
										setAttempt((n) => n + 1);
									}}
									className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-neutral-50 hover:bg-white/15"
								>
									{t('retry')}
								</button>
							</div>
						) : (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
								<p className="text-sm text-neutral-300">
									{t('loading', { segment: load.state === 'loading' ? load.segment : 1, segments: game.segments.length })}
								</p>
								<div
									className="h-1.5 w-64 max-w-full overflow-hidden rounded bg-neutral-800"
									role="progressbar"
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={load.state === 'loading' && total > 0 ? Math.round((load.done / total) * 100) : 0}
								>
									<div
										className="h-full bg-[color:var(--accent)] transition-[width]"
										style={{ width: `${load.state === 'loading' && total > 0 ? Math.min(100, (load.done / total) * 100) : 0}%` }}
									/>
								</div>
							</div>
						)}
					</div>

					<aside aria-label={t('events')} className="hidden min-h-0 border-l border-neutral-800 lg:block">
						{model ? (
							<Events
								model={model}
								second={second}
								who={who}
								weaponName={weaponName}
								sideName={sideName}
								sideColor={sideColor}
								zoneName={zoneName}
								onSeek={onSeek}
							/>
						) : null}
					</aside>
				</div>

				{model ? (
					<Timeline
						model={model}
						time={time}
						playing={playing}
						speed={speed}
						realTime={realTime}
						sideColor={sideColor}
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
				<div className="mt-3 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 lg:hidden">
					<div role="tablist" className="grid grid-cols-2 gap-1 p-1.5">
						{(['units', 'events'] as const).map((value) => (
							<button
								key={value}
								type="button"
								role="tab"
								aria-selected={tab === value}
								onClick={() => setTab(value)}
								className={'min-h-10 rounded-xl text-sm font-semibold ' + (tab === value ? 'bg-white/10 text-neutral-50' : 'text-neutral-400')}
							>
								{t(value)}
							</button>
						))}
					</div>
					<div className="h-[50vh]">
						{tab === 'units' ? (
							<Units
								model={model}
								second={second}
								follow={follow}
								sideName={sideName}
								sideColor={sideColor}
								callsignFor={callsignFor}
								playerName={playerName}
								roleName={roleName}
								vehicleName={vehicleName}
								onFollow={onFollowEntity}
							/>
						) : (
							<Events
								model={model}
								second={second}
								who={who}
								weaponName={weaponName}
								sideName={sideName}
								sideColor={sideColor}
								zoneName={zoneName}
								onSeek={onSeek}
							/>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}
