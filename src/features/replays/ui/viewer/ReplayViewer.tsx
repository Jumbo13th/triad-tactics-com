'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { PublicReplayGame } from '../../domain/api';
import { addSegment, emptyModel, positionAt, unixAt, valueAt, type Entity, type ReplayEvent, type ReplayModel } from '../../domain/replayFormat';
import type { ReplayStatsSummary } from '../../domain/statsSummary';
import { terrainName } from '../../domain/terrain';
import { parseTopo, toLayers } from '../../domain/topo';
import EventsPanel, { type Who } from './EventsPanel';
import { formatMissionTime } from './format';
import { gameName, loadGameNames, type GameNames } from './gameNames';
import { Icon } from './glyphs';
import MapCanvas, { carrier, centroid, type MapCanvasHandle, type MapPoint } from './MapCanvas';
import { MapControls, SelectionCard } from './MapOverlays';
import { describeSelection } from './selection';
import { StatsPanel } from './StatsPanel';
import { NEUTRAL_STYLE, sideStyle as styleOf, type SideStyle } from './sideStyle';
import Timeline, { SPEED_PRESETS } from './Timeline';
import { prepareTopo, type PreparedTopo } from './topoDraw';
import UnitsPanel from './UnitsPanel';
import { useDismiss } from './useDismiss';
import { useHydrated } from './useHydrated';
import { DEFAULT_SETTINGS, PANEL_MAX, PANEL_MIN, useViewerSettings } from './viewerSettings';

const Units = memo(UnitsPanel);
const Events = memo(EventsPanel);

type Load =
	| { state: 'loading'; done: number; total: number; segment: number }
	| { state: 'failed'; segment: number }
	| { state: 'ready'; model: ReplayModel };

type PanelKey = 'units' | 'events';

const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';
const barButton =
	'inline-flex size-[36px] shrink-0 items-center justify-center rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent)]';

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

function isDesktop(): boolean {
	return window.matchMedia('(min-width: 1024px)').matches;
}

function BarButton({
	label,
	text,
	pressed,
	onClick,
	children,
}: {
	label: string;
	/** Shown beside the icon on wide screens, where there is room to say what the button is. */
	text?: string;
	pressed?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			className={`${barButton} ${text ? 'xl:w-auto xl:gap-[6px] xl:px-[8px] xl:text-[13px] xl:font-semibold' : ''} ${pressed ? 'bg-[rgba(210,184,83,0.12)] text-[color:var(--accent)]' : 'text-neutral-300 hover:bg-[#1a1a1a] hover:text-neutral-100'}`}
		>
			{children}
			{text ? <span className="hidden xl:inline">{text}</span> : null}
		</button>
	);
}

// A collapsed panel leaves a strip on its edge of the map, so the way back is in plain sight.
function CollapsedRail({ side, label, title, onOpen }: { side: 'left' | 'right'; label: string; title: string; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={title}
			title={title}
			className={
				'group hidden w-[36px] shrink-0 flex-col items-center gap-[10px] bg-[#121212] pt-[10px] text-neutral-200 hover:bg-[#1a1a1a] hover:text-[color:var(--accent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)] lg:flex ' +
				(side === 'left' ? 'border-r border-[#2c2c2c]' : 'border-l border-[#2c2c2c]')
			}
		>
			{side === 'left' ? <Icon.PanelLeft /> : <Icon.PanelRight />}
			<span className={`[writing-mode:vertical-rl] ${eyebrow}`}>{label}</span>
			<span className="text-neutral-500 group-hover:text-[color:var(--accent)]">{side === 'left' ? <Icon.ChevronRight /> : <Icon.ChevronLeft />}</span>
		</button>
	);
}

function ShortcutsButton() {
	const t = useTranslations('replayViewer');
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, rootRef, close);
	const rows: [string, string][] = [
		['Space', t('keyPlay')],
		['← →', t('keySeek')],
		['Shift + ← →', t('keySeekLong')],
		['[ ]', t('keySpeed')],
		['U', t('keyUnits')],
		['E', t('keyEvents')],
		['F', t('keyFullscreen')],
		['Esc', t('keyClear')],
	];
	return (
		<div ref={rootRef} className="relative hidden lg:block">
			<BarButton label={t('shortcuts')} pressed={open} onClick={() => setOpen((value) => !value)}>
				<Icon.Keyboard />
			</BarButton>
			{open ? (
				<div
					role="dialog"
					aria-label={t('shortcuts')}
					className="absolute right-0 top-full z-30 mt-[6px] w-[260px] rounded-[8px] border border-[#2c2c2c] bg-[#1a1a1a] p-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
				>
					<p className={`pb-[6px] text-neutral-400 ${eyebrow}`}>{t('shortcuts')}</p>
					<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[12px] gap-y-[6px] text-[13px] leading-[18px]">
						{rows.map(([key, label]) => (
							<div key={key} className="contents">
								<dt>
									<kbd className="rounded-[3px] border border-[#2c2c2c] bg-[#121212] px-[6px] py-[1px] font-sans text-[12px] font-semibold text-neutral-100">{key}</kbd>
								</dt>
								<dd className="text-neutral-300">{label}</dd>
							</div>
						))}
					</dl>
				</div>
			) : null}
		</div>
	);
}

function Panel({
	side,
	title,
	open,
	drawerOpen,
	width,
	closeLabel,
	resizeLabel,
	onClose,
	onWidth,
	onWidthDone,
	children,
}: {
	side: 'left' | 'right';
	title: string;
	open: boolean;
	drawerOpen: boolean;
	width: number;
	closeLabel: string;
	resizeLabel: string;
	onClose: () => void;
	onWidth: (width: number) => void;
	onWidthDone: (width: number) => void;
	children: ReactNode;
}) {
	const drag = useRef<{ x: number; width: number } | null>(null);
	const clamp = (value: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, value)));
	const defaultWidth = side === 'left' ? DEFAULT_SETTINGS.unitsWidth : DEFAULT_SETTINGS.eventsWidth;
	return (
		<aside
			aria-label={title}
			className={
				`${drawerOpen ? 'flex' : 'hidden'} ${open ? 'lg:flex' : 'lg:hidden'} absolute inset-y-0 ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'} ` +
				'z-20 w-[min(88vw,360px)] flex-col border-[#2c2c2c] bg-[#121212] shadow-[0_8px_24px_rgba(0,0,0,0.45)] lg:relative lg:z-auto lg:w-[var(--panel-w)] lg:shrink-0 lg:shadow-none'
			}
			style={{ '--panel-w': `${width}px` } as CSSProperties}
		>
			<div className="flex h-[40px] shrink-0 items-center justify-between gap-[8px] border-b border-[#1e1e1e] pl-[12px] pr-[4px]">
				<h2 className={`text-neutral-400 ${eyebrow}`}>{title}</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label={closeLabel}
					title={closeLabel}
					className="inline-flex size-[32px] items-center justify-center rounded-[4px] text-neutral-400 hover:bg-[#1a1a1a] hover:text-neutral-100"
				>
					<span className="hidden lg:flex">{side === 'left' ? <Icon.ChevronLeft /> : <Icon.ChevronRight />}</span>
					<span className="flex lg:hidden">
						<Icon.Close />
					</span>
				</button>
			</div>
			<div className="min-h-0 flex-1">{children}</div>
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={resizeLabel}
				aria-valuemin={PANEL_MIN}
				aria-valuemax={PANEL_MAX}
				aria-valuenow={width}
				tabIndex={0}
				onPointerDown={(e) => {
					drag.current = { x: e.clientX, width };
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					if (!drag.current) return;
					const dx = e.clientX - drag.current.x;
					onWidth(clamp(drag.current.width + (side === 'left' ? dx : -dx)));
				}}
				onPointerUp={() => {
					if (!drag.current) return;
					drag.current = null;
					onWidthDone(width);
				}}
				onDoubleClick={() => onWidthDone(defaultWidth)}
				onKeyDown={(e) => {
					if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
					e.preventDefault();
					const grow = (e.key === 'ArrowRight') === (side === 'left');
					onWidthDone(clamp(width + (grow ? 16 : -16)));
				}}
				className={`group absolute inset-y-0 z-10 hidden w-[7px] cursor-col-resize lg:block ${side === 'left' ? '-right-[4px]' : '-left-[4px]'}`}
			>
				<span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent group-hover:bg-[color:var(--accent)] group-focus-visible:bg-[color:var(--accent)]" />
			</div>
		</aside>
	);
}

export default function ReplayViewer({ game, stats }: { game: PublicReplayGame; stats: ReplayStatsSummary | null }) {
	const t = useTranslations('replayViewer');
	const locale = useLocale();
	const hydrated = useHydrated();
	const [settings, updateSettings] = useViewerSettings();
	const total = useMemo(() => game.segments.reduce((sum, s) => sum + s.size, 0), [game]);
	const [load, setLoad] = useState<Load>({ state: 'loading', done: 0, total, segment: 1 });
	const [attempt, setAttempt] = useState(0);
	const [names, setNames] = useState<GameNames>({});
	const [relief, setRelief] = useState<HTMLImageElement | null>(null);
	const [topo, setTopo] = useState<PreparedTopo | null>(null);
	const [time, setTime] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const [following, setFollowing] = useState(false);
	const [drawer, setDrawer] = useState<PanelKey | null>(null);
	const [dragWidth, setDragWidth] = useState<{ units?: number; events?: number }>({});
	const [fullscreen, setFullscreen] = useState(false);
	const [copied, setCopied] = useState(false);
	const mapRef = useRef<MapCanvasHandle>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const timeRef = useRef(0);
	useEffect(() => {
		timeRef.current = time;
	}, [time]);

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

	const speed = settings.speed;
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

	useEffect(() => {
		const onChange = () => setFullscreen(document.fullscreenElement !== null);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	}, []);

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
	const nameOf = useCallback((entity: Entity) => gameName(names, entity.name), [names]);
	const vehicleName = useCallback(
		(eid: number) => {
			const vehicle = model?.entities.get(eid);
			return vehicle ? gameName(names, vehicle.name) : '';
		},
		[names, model]
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
	const who = useCallback<Who>(
		(eid, at) => {
			const entity = eid !== null ? model?.entities.get(eid) : undefined;
			if (!entity) return null;
			return { name: playerName(entity.eid, at) ?? gameName(names, entity.name), side: entity.side, vehicle: entity.kind !== 'man' };
		},
		[model, names, playerName]
	);

	// A body keeps the name of the last player in it, so the dead are still named.
	const bodyNames = useMemo(() => {
		const map = new Map<number, string>();
		for (const player of model?.players.values() ?? []) {
			for (const change of player.controls) {
				const name = change.value !== null ? valueAt(player.names, change.t, '') : '';
				if (change.value !== null && name) map.set(change.value, name);
			}
		}
		return map;
	}, [model]);
	const controllers = useMemo(() => {
		const map = new Map<number, string>();
		for (const player of model?.players.values() ?? []) {
			const eid = valueAt(player.controls, second * 10, null);
			const name = valueAt(player.names, second * 10, '');
			if (eid !== null && name) map.set(eid, name);
		}
		return map;
	}, [model, second]);
	const nicknameOf = useCallback(
		(entity: Entity) => {
			if (entity.kind !== 'man') return null;
			const current = controllers.get(entity.eid);
			if (current) return current;
			// Only the dead keep the name of the last player in them: a living body a player
			// left behind belongs to nobody, or to the AI, again.
			return valueAt(entity.life, second * 10, 'alive') === 'dead' ? (bodyNames.get(entity.eid) ?? null) : null;
		},
		[controllers, bodyNames, second]
	);

	const select = useCallback((eid: number | null) => {
		setSelected(eid);
		setFollowing(false);
	}, []);
	// From a list the camera goes along; picking the followed unit again lets it go.
	const pick = useCallback(
		(eid: number) => {
			if (eid === selected && following) {
				setFollowing(false);
				return;
			}
			setSelected(eid);
			setFollowing(true);
		},
		[selected, following]
	);
	const stopFollowing = useCallback(() => setFollowing(false), []);
	const onSeek = useCallback((at: number) => setTime(at), []);

	const pickEvent = useCallback(
		(event: ReplayEvent) => {
			if (!model) return;
			setTime(Math.max(0, event.t - 50));
			const points: MapPoint[] = [];
			const place = (eid: number | null) => {
				const unit = eid !== null ? model.entities.get(eid) : undefined;
				const at = unit ? positionAt(carrier(model, unit, event.t), event.t) : null;
				if (at) points.push({ x: at.x, z: at.z });
			};
			let subject: number | null = null;
			switch (event.type) {
				case 'kill':
					place(event.victim);
					place(event.killer);
					subject = event.victim;
					break;
				case 'down':
					place(event.victim);
					place(event.attacker);
					subject = event.victim;
					break;
				case 'up':
					place(event.victim);
					subject = event.victim;
					break;
				case 'capture': {
					const zone = model.zones.get(event.zid);
					if (zone && zone.points.length >= 6) {
						const [x, z] = centroid(zone.points);
						points.push({ x, z });
					}
					break;
				}
			}
			if (subject !== null) select(subject);
			if (points.length) mapRef.current?.focus(points);
		},
		[model, select]
	);

	const togglePlay = useCallback(() => {
		if (!model) return;
		if (!playing && timeRef.current >= model.duration) setTime(0);
		setPlaying(!playing);
	}, [model, playing]);
	const setSpeed = useCallback((value: number) => updateSettings({ speed: value }), [updateSettings]);
	const stepSpeed = useCallback(
		(direction: 1 | -1) => {
			const next =
				direction > 0
					? (SPEED_PRESETS.find((value) => value > speed + 1e-9) ?? SPEED_PRESETS[SPEED_PRESETS.length - 1])
					: ([...SPEED_PRESETS].reverse().find((value) => value < speed - 1e-9) ?? SPEED_PRESETS[0]);
			updateSettings({ speed: next });
		},
		[speed, updateSettings]
	);
	const togglePanel = useCallback(
		(panel: PanelKey) => {
			if (isDesktop()) updateSettings(panel === 'units' ? { unitsOpen: !settings.unitsOpen } : { eventsOpen: !settings.eventsOpen });
			else setDrawer((current) => (current === panel ? null : panel));
		},
		[settings.unitsOpen, settings.eventsOpen, updateSettings]
	);
	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void rootRef.current?.requestFullscreen?.();
	}, []);

	useEffect(() => {
		if (!model) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
			switch (event.key) {
				case ' ':
					// A focused button already answers Space with its own click.
					if (target?.tagName === 'BUTTON') return;
					event.preventDefault();
					togglePlay();
					break;
				case 'ArrowLeft':
				case 'ArrowRight': {
					event.preventDefault();
					const step = (event.shiftKey ? 600 : 100) * (event.key === 'ArrowLeft' ? -1 : 1);
					setTime((value) => Math.min(model.duration, Math.max(0, value + step)));
					break;
				}
				case '[':
				case ']':
					stepSpeed(event.key === ']' ? 1 : -1);
					break;
				case 'f':
				case 'F':
					toggleFullscreen();
					break;
				case 'u':
				case 'U':
					togglePanel('units');
					break;
				case 'e':
				case 'E':
					togglePanel('events');
					break;
				case 'Escape':
					select(null);
					setDrawer(null);
					break;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [model, togglePlay, stepSpeed, toggleFullscreen, togglePanel, select]);

	const realTime = useMemo(() => {
		if (!model) return null;
		const unix = unixAt(model, second * 10);
		return unix === null ? null : new Date(unix * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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

	const selection = useMemo(
		() => (model && selected !== null ? describeSelection(model, selected, second * 10, { nicknameOf, nameOf, callsignFor, weaponName }) : null),
		[model, selected, second, nicknameOf, nameOf, callsignFor, weaponName]
	);
	const sample = useMemo<[SideStyle, SideStyle]>(() => {
		const styles = (model?.sides ?? []).map((side) => styleOf(side.color));
		return [styles[0] ?? NEUTRAL_STYLE, styles[1] ?? styles[0] ?? NEUTRAL_STYLE];
	}, [model]);

	// When the game was played, in the viewer's own time zone, once the page runs in their browser.
	const played =
		hydrated && game.startedAt !== null ? new Date(game.startedAt * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }) : null;
	const meta = [t('episode', { episode: game.episodeNumber }), terrainName(game.world), played].filter(Boolean).join(' · ');
	const progress = load.state === 'loading' && total > 0 ? Math.min(100, (load.done / total) * 100) : 0;
	const unitsWidth = dragWidth.units ?? settings.unitsWidth;
	const eventsWidth = dragWidth.events ?? settings.eventsWidth;
	const unitsShown = hydrated && (drawer === 'units' || (settings.unitsOpen && isDesktop()));
	const eventsShown = hydrated && (drawer === 'events' || (settings.eventsOpen && isDesktop()));

	return (
		<div ref={rootRef} className="flex h-dvh flex-col overflow-hidden bg-[#0a0a0a] text-[14px] leading-[20px] text-neutral-100">
			<header className="flex h-[48px] shrink-0 items-center gap-[6px] border-b border-[#2c2c2c] bg-[#121212] px-[6px]">
				<Link
					href="/replays"
					locale={locale}
					aria-label={t('backToReplays')}
					title={t('backToReplays')}
					className="inline-flex h-[36px] shrink-0 items-center gap-[4px] rounded-[4px] px-[8px] text-[13px] font-semibold text-neutral-300 hover:bg-[#1a1a1a] hover:text-neutral-100"
				>
					<Icon.ChevronLeft size={18} />
					<span className="hidden sm:inline">{t('back')}</span>
				</Link>
				<span aria-hidden="true" className="hidden h-[24px] w-px shrink-0 bg-[#2c2c2c] sm:block" />
				<div className="flex min-w-0 flex-1 items-baseline gap-[10px] px-[6px]">
					<h1 className="truncate text-[15px] font-semibold leading-[20px] text-neutral-100">{game.missionTitle}</h1>
					<p className="hidden min-w-0 truncate text-[12px] leading-[16px] tabular-nums text-neutral-400 md:block">{meta}</p>
				</div>
				<div className="flex shrink-0 items-center gap-[2px]">
					<BarButton label={t('toggleUnits')} text={t('units')} pressed={unitsShown} onClick={() => togglePanel('units')}>
						<Icon.PanelLeft />
					</BarButton>
					<BarButton label={t('toggleEvents')} text={t('events')} pressed={eventsShown} onClick={() => togglePanel('events')}>
						<Icon.PanelRight />
					</BarButton>
					<span aria-hidden="true" className="mx-[4px] hidden h-[20px] w-px bg-[#2c2c2c] sm:block" />
					<StatsPanel stats={stats} model={model} sideStyle={sideStyle} sideName={sideName} buttonClass={barButton} />
					<BarButton label={copied ? t('linkCopied') : t('copyLink', { time: formatMissionTime(time) })} pressed={copied} onClick={() => void copyLink()}>
						{copied ? <Icon.Check size={18} /> : <Icon.Link size={18} />}
					</BarButton>
					<ShortcutsButton />
					<BarButton label={fullscreen ? t('exitFullscreen') : t('fullscreen')} onClick={toggleFullscreen}>
						{fullscreen ? <Icon.Minimize /> : <Icon.Maximize />}
					</BarButton>
				</div>
			</header>

			<div className="relative flex min-h-0 flex-1">
				{model && hydrated && !settings.unitsOpen ? (
					<CollapsedRail side="left" label={t('units')} title={t('showUnits')} onOpen={() => togglePanel('units')} />
				) : null}
				{model ? (
					<Panel
						side="left"
						title={t('units')}
						open={settings.unitsOpen}
						drawerOpen={drawer === 'units'}
						width={unitsWidth}
						closeLabel={t('hideUnits')}
						resizeLabel={t('resizeUnits')}
						onClose={() => togglePanel('units')}
						onWidth={(width) => setDragWidth((current) => ({ ...current, units: width }))}
						onWidthDone={(width) => {
							setDragWidth((current) => ({ ...current, units: undefined }));
							updateSettings({ unitsWidth: width });
						}}
					>
						<Units
							model={model}
							second={listSecond}
							selected={selected}
							following={following}
							sideName={sideName}
							sideStyle={sideStyle}
							callsignFor={callsignFor}
							nicknameOf={nicknameOf}
							roleName={nameOf}
							vehicleName={vehicleName}
							onPick={pick}
						/>
					</Panel>
				) : null}

				<section aria-label={t('mapLabel')} className="relative min-w-0 flex-1 overflow-hidden bg-[#c4e7ed]">
					{model ? (
						<>
							<MapCanvas
								model={model}
								t={time}
								relief={relief}
								topo={topo}
								layers={settings.layers}
								selected={selected}
								following={following}
								sideStyle={sideStyle}
								nicknameOf={nicknameOf}
								nameOf={nameOf}
								callsignFor={callsignFor}
								contested={t('contested')}
								onSelect={select}
								onPan={stopFollowing}
								handleRef={mapRef}
								ariaLabel={t('mapLabel')}
							/>
							{selection ? (
								<SelectionCard
									info={selection}
									following={following}
									sideStyle={sideStyle}
									sideName={sideName}
									onSelect={select}
									onFollow={() => setFollowing((value) => !value)}
									onClose={() => select(null)}
								/>
							) : null}
							<MapControls
								layers={settings.layers}
								onLayers={(layers) => updateSettings({ layers })}
								onZoomIn={() => mapRef.current?.zoom(1.5)}
								onZoomOut={() => mapRef.current?.zoom(1 / 1.5)}
								onFit={() => {
									setFollowing(false);
									mapRef.current?.fit();
								}}
								sample={sample}
							/>
							{drawer ? (
								<button type="button" aria-label={t('closePanel')} onClick={() => setDrawer(null)} className="absolute inset-0 z-10 bg-black/40 lg:hidden" />
							) : null}
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
								<Link
									href="/replays"
									locale={locale}
									className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] px-[14px] text-[13px] font-semibold text-neutral-100 hover:border-[#666666] hover:bg-[#242424]"
								>
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

				{model ? (
					<Panel
						side="right"
						title={t('events')}
						open={settings.eventsOpen}
						drawerOpen={drawer === 'events'}
						width={eventsWidth}
						closeLabel={t('hideEvents')}
						resizeLabel={t('resizeEvents')}
						onClose={() => togglePanel('events')}
						onWidth={(width) => setDragWidth((current) => ({ ...current, events: width }))}
						onWidthDone={(width) => {
							setDragWidth((current) => ({ ...current, events: undefined }));
							updateSettings({ eventsWidth: width });
						}}
					>
						<Events
							model={model}
							second={listSecond}
							playing={playing}
							selected={selected}
							onPick={pickEvent}
							who={who}
							weaponName={weaponName}
							sideName={sideName}
							sideStyle={sideStyle}
							zoneName={zoneName}
							translate={translate}
						/>
					</Panel>
				) : null}
				{model && hydrated && !settings.eventsOpen ? (
					<CollapsedRail side="right" label={t('events')} title={t('showEvents')} onOpen={() => togglePanel('events')} />
				) : null}
			</div>

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
					onTogglePlay={togglePlay}
					onSpeed={setSpeed}
					onSeek={onSeek}
				/>
			) : (
				<div aria-hidden="true" className="h-[72px] shrink-0 border-t border-[#2c2c2c] bg-[#121212]" />
			)}
		</div>
	);
}
