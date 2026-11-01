'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { positionAt, segmentAt, valueAt, type Entity, type ReplayModel } from '../../domain/replayFormat';
import { Icon } from './glyphs';
import {
	ACCENT,
	INK,
	contestedPattern,
	drawBlast,
	drawBrackets,
	drawCorpse,
	drawCrew,
	drawFallbackMarker,
	drawMarkerText,
	drawPlate,
	drawSoldier,
	drawSquad,
	drawTracer,
	drawUnconscious,
	drawVehicle,
	type LabelBox,
} from './mapSymbols';
import { MARKER_ICONS, NEUTRAL_STYLE, displayColor, markerColor, withAlpha, type SideStyle } from './sideStyle';
import { drawTopo, type PreparedTopo } from './topoDraw';

export type MapLayers = { names: boolean; fire: boolean; markers: boolean; areas: boolean; dead: boolean };

export type MapCanvasHandle = { fit: () => void; zoom: (factor: number) => void };

type View = { cx: number; cz: number; scale: number };

type Props = {
	model: ReplayModel;
	t: number;
	relief: HTMLImageElement | null;
	topo: PreparedTopo | null;
	follow: number | null;
	layers: MapLayers;
	sideStyle: (side: string | null) => SideStyle;
	labelFor: (entity: Entity) => string;
	callsignFor: (groupKey: string) => string;
	contested: string;
	onFollow: (eid: number | null) => void;
	handleRef?: Ref<MapCanvasHandle>;
	ariaLabel: string;
};

// Tenths of a second each effect stays on the map.
const KILL_LINE = 30;
const DETONATION = 20;
const SHOT = 10;
const BLAST_RADIUS: Record<string, number> = { grenade: 12, rocket: 14, shell: 18 };
const MIN_SCALE = 0.02;
const MAX_SCALE = 12;
// Squads are shown by their frame and callsign below this many pixels per metre, and
// soldiers by name above it.
const SQUADS_BELOW = 1.2;
const RULER_TOP = 20;
const RULER_LEFT = 32;
const RULER_STEPS = [100, 200, 500, 1000, 2000, 5000];
const SCALE_LENGTHS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

function activityBounds(model: ReplayModel): [number, number, number, number] {
	let minX = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxZ = -Infinity;
	for (const entity of model.entities.values()) {
		const track = entity.track;
		for (let i = 0; i < track.t.length; i++) {
			if (track.x[i] < minX) minX = track.x[i];
			if (track.x[i] > maxX) maxX = track.x[i];
			if (track.z[i] < minZ) minZ = track.z[i];
			if (track.z[i] > maxZ) maxZ = track.z[i];
		}
	}
	if (!Number.isFinite(minX)) return model.bounds;
	const pad = Math.max(150, (maxX - minX + maxZ - minZ) * 0.08);
	return [minX - pad, minZ - pad, maxX + pad, maxZ + pad];
}

/** The in-game grid reference: hundreds of metres, three digits per axis. */
export function gridReference(x: number, z: number): string {
	if (x < 0 || z < 0) return '— —';
	const part = (v: number) => String(Math.floor(v / 100)).padStart(3, '0');
	return `${part(x)} ${part(z)}`;
}

function inside(points: number[], x: number, z: number): boolean {
	let hit = false;
	for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
		const xi = points[i];
		const zi = points[i + 1];
		const xj = points[j];
		const zj = points[j + 1];
		if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
	}
	return hit;
}

const icons = new Map<string, HTMLImageElement>();

function markerIcon(src: string, onLoad: () => void): HTMLImageElement | null {
	let image = icons.get(src);
	if (!image) {
		image = new Image();
		image.onload = onLoad;
		image.src = src;
		icons.set(src, image);
	}
	return image.complete && image.naturalWidth > 0 ? image : null;
}

type Plate = { text: string; anchor: number; y: number; align?: 'left' | 'right' | 'center'; outlined?: boolean; muted?: boolean; stack?: boolean };

export default function MapCanvas(props: Props) {
	const { model, t, relief, topo, follow, layers, sideStyle, labelFor, callsignFor, contested, onFollow, handleRef, ariaLabel } = props;
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scaleBarRef = useRef<HTMLDivElement>(null);
	const scaleHalfRef = useRef<HTMLSpanElement>(null);
	const scaleFullRef = useRef<HTMLSpanElement>(null);
	const pointerRef = useRef<HTMLSpanElement>(null);
	const viewRef = useRef<View | null>(null);
	const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
	const hitsRef = useRef<{ eid: number; x: number; y: number }[]>([]);
	const dragRef = useRef<{ x: number; y: number; moved: boolean; pointers: Map<number, { x: number; y: number }>; pinch: number | null }>({
		x: 0,
		y: 0,
		moved: false,
		pointers: new Map(),
		pinch: null,
	});
	const drawRef = useRef<() => void>(() => undefined);

	const fit = useCallback(() => {
		const { w, h } = sizeRef.current;
		if (w === 0 || h === 0) return;
		const [minX, minZ, maxX, maxZ] = activityBounds(model);
		const scale = Math.min((w - RULER_LEFT) / (maxX - minX), (h - RULER_TOP) / (maxZ - minZ));
		viewRef.current = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) };
		drawRef.current();
	}, [model]);

	const zoom = useCallback((factor: number) => {
		const view = viewRef.current;
		if (!view) return;
		view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
		drawRef.current();
	}, []);

	useImperativeHandle(handleRef, () => ({ fit, zoom }), [fit, zoom]);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const view = viewRef.current;
		if (!canvas || !view) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { w, h, dpr } = sizeRef.current;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const followed = follow !== null ? model.entities.get(follow) : undefined;
		const followedSeat = followed ? valueAt(followed.seats, t, null) : null;
		const followedLife = followed ? valueAt(followed.life, t, 'alive') : 'alive';
		// Someone aboard is followed through the vehicle they ride in.
		const focusEntity = followed && followedSeat && followedLife !== 'dead' ? model.entities.get(followedSeat.vehicle) : followed;
		const focus = focusEntity ? positionAt(focusEntity, t) : null;
		if (focus) {
			view.cx = focus.x;
			view.cz = focus.z;
		}

		const sx = (x: number) => (x - view.cx) * view.scale + w / 2;
		const sy = (z: number) => (view.cz - z) * view.scale + h / 2;
		const left = view.cx - w / 2 / view.scale;
		const right = view.cx + w / 2 / view.scale;
		const top = view.cz + h / 2 / view.scale;
		const bottom = view.cz - h / 2 / view.scale;
		const [minX, minZ, maxX, maxZ] = model.bounds;

		// Without a relief image the ground is map paper, so dark area outlines stay visible.
		ctx.fillStyle = relief ? '#c4e7ed' : '#d5d9d4';
		ctx.fillRect(0, 0, w, h);
		if (relief && maxX > minX) {
			ctx.imageSmoothingEnabled = view.scale < 2;
			ctx.drawImage(relief, sx(minX), sy(maxZ), (maxX - minX) * view.scale, (maxZ - minZ) * view.scale);
		}
		if (topo) drawTopo(ctx, topo, sx, sy, view.scale, { left, right, bottom, top });

		// The in-game map's grid: kilometre lines, and 100 m lines once they are far enough apart.
		ctx.lineWidth = 1;
		const gridStep = view.scale * 100 >= 24 ? 100 : 1000;
		const from = (v: number) => Math.floor(v / gridStep) * gridStep;
		for (let x = from(left); x <= right; x += gridStep) {
			ctx.strokeStyle = withAlpha(INK, x % 1000 === 0 ? 0.34 : 0.11);
			ctx.beginPath();
			ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
			ctx.lineTo(Math.round(sx(x)) + 0.5, h);
			ctx.stroke();
		}
		for (let z = from(bottom); z <= top; z += gridStep) {
			ctx.strokeStyle = withAlpha(INK, z % 1000 === 0 ? 0.34 : 0.11);
			ctx.beginPath();
			ctx.moveTo(0, Math.round(sy(z)) + 0.5);
			ctx.lineTo(w, Math.round(sy(z)) + 0.5);
			ctx.stroke();
		}

		// Where everyone is, before anything is drawn: zones need it to tell who is inside.
		const segment = segmentAt(model, t);
		const crews = new Map<number, number>();
		const squads = new Map<string, { x: number; top: number; n: number; side: string | null }>();
		const men: { entity: Entity; wx: number; wz: number; x: number; y: number; h: number; life: string }[] = [];
		for (const entity of model.entities.values()) {
			if (entity.kind !== 'man' || entity.appearedAt > t || (entity.removedAt !== null && entity.removedAt <= t)) continue;
			const life = valueAt(entity.life, t, 'alive');
			const seat = valueAt(entity.seats, t, null);
			if (seat && life !== 'dead') {
				crews.set(seat.vehicle, (crews.get(seat.vehicle) ?? 0) + 1);
				continue;
			}
			const at = positionAt(entity, t);
			if (!at) continue;
			const man = { entity, wx: at.x, wz: at.z, x: sx(at.x), y: sy(at.z), h: at.h, life };
			men.push(man);
			const group = entity.groups.get(segment);
			if (group && life !== 'dead') {
				const squad = squads.get(group) ?? { x: 0, top: Infinity, n: 0, side: entity.side };
				squad.x += man.x;
				squad.top = Math.min(squad.top, man.y);
				squad.n++;
				squads.set(group, squad);
			}
		}

		const plates: Plate[] = [];
		const hits: { eid: number; x: number; y: number }[] = [];

		if (layers.areas) {
			for (const area of model.areas.values()) {
				if (!valueAt(area.shown, t, true) || area.points.length < 4) continue;
				ctx.beginPath();
				ctx.moveTo(sx(area.points[0]), sy(area.points[1]));
				for (let i = 2; i < area.points.length; i += 2) ctx.lineTo(sx(area.points[i]), sy(area.points[i + 1]));
				if (!area.open) {
					ctx.closePath();
					if (area.fill) {
						ctx.fillStyle = displayColor(area.fill);
						ctx.fill();
					}
				}
				ctx.strokeStyle = area.outline ? displayColor(area.outline) : INK;
				ctx.lineWidth = area.outline ? Math.max(1, Math.min(4, area.width)) : 2;
				ctx.stroke();
				if (area.label) {
					const mid = Math.floor(area.points.length / 4) * 2;
					const at = area.open ? [area.points[mid], area.points[mid + 1]] : centroid(area.points);
					plates.push({ text: area.label, anchor: sx(at[0]) + 8, y: sy(at[1]), muted: true });
				}
			}
			for (const zone of model.zones.values()) {
				if (zone.points.length < 6) continue;
				const holder = valueAt(zone.holders, t, null);
				const present = new Set<string>();
				for (const man of men) {
					if (man.life === 'alive' && man.entity.side && inside(zone.points, man.wx, man.wz)) present.add(man.entity.side);
				}
				const contesting = present.size >= 2 ? [...present].sort((a, b) => Number(b === holder) - Number(a === holder)).slice(0, 2) : null;
				ctx.beginPath();
				ctx.moveTo(sx(zone.points[0]), sy(zone.points[1]));
				for (let i = 2; i < zone.points.length; i += 2) ctx.lineTo(sx(zone.points[i]), sy(zone.points[i + 1]));
				ctx.closePath();
				if (contesting) {
					const [a, b] = contesting.map((side) => sideStyle(side));
					ctx.fillStyle = contestedPattern(ctx, a.fill, b.fill) ?? withAlpha(NEUTRAL_STYLE.fill, 0.16);
					ctx.strokeStyle = b.edge;
					ctx.setLineDash([6, 4]);
				} else if (holder) {
					const style = sideStyle(holder);
					ctx.fillStyle = withAlpha(style.fill, 0.22);
					ctx.strokeStyle = style.edge;
				} else {
					ctx.fillStyle = withAlpha(NEUTRAL_STYLE.fill, 0.16);
					ctx.strokeStyle = NEUTRAL_STYLE.edge;
					ctx.setLineDash([6, 4]);
				}
				ctx.fill();
				ctx.lineWidth = 2;
				ctx.lineJoin = 'round';
				ctx.stroke();
				ctx.setLineDash([]);
				if (zone.label) {
					const [cx] = centroid(zone.points);
					let highest = -Infinity;
					for (let i = 1; i < zone.points.length; i += 2) highest = Math.max(highest, zone.points[i]);
					plates.push({ text: contesting ? `${zone.label} · ${contested}` : zone.label, anchor: sx(cx), y: sy(highest) - 12, align: 'center' });
				}
			}
		}

		if (layers.markers) {
			const redraw = () => drawRef.current();
			for (const marker of model.markers.values()) {
				if (marker.placedAt > t || (marker.removedAt !== null && marker.removedAt <= t)) continue;
				const x = sx(marker.x);
				const y = sy(marker.z);
				const color = markerColor(marker.color);
				const image = color && MARKER_ICONS.has(marker.icon) ? markerIcon(`/markers/icons/${marker.icon}-${color}.png`, redraw) : null;
				if (image) ctx.drawImage(image, x - 12, y - 12, 24, 24);
				else drawFallbackMarker(ctx, x, y, marker.color ? displayColor(marker.color) : '#ee322e');
				if (marker.text) drawMarkerText(ctx, marker.text, x + (image ? 14 : 10), y);
			}
		}

		// The dead first: corpses and wrecks lie beneath every living unit.
		if (layers.dead) {
			for (const man of men) {
				if (man.life !== 'dead') continue;
				drawCorpse(ctx, man.x, man.y);
				hits.push({ eid: man.entity.eid, x: man.x, y: man.y });
			}
		}
		const vehicles: { entity: Entity; x: number; y: number; wreck: boolean }[] = [];
		for (const entity of model.entities.values()) {
			if (entity.kind === 'man' || entity.appearedAt > t || (entity.removedAt !== null && entity.removedAt <= t)) continue;
			const wreck = valueAt(entity.life, t, 'alive') === 'dead';
			if (wreck && !layers.dead) continue;
			const at = positionAt(entity, t);
			if (at) vehicles.push({ entity, x: sx(at.x), y: sy(at.z), wreck });
		}
		for (const vehicle of vehicles) {
			if (!vehicle.wreck) continue;
			drawVehicle(ctx, vehicle.x, vehicle.y, NEUTRAL_STYLE, true);
			hits.push({ eid: vehicle.entity.eid, x: vehicle.x, y: vehicle.y });
		}

		if (layers.fire) {
			for (const event of model.events) {
				if (event.type !== 'kill' || event.t > t || event.t < t - KILL_LINE || event.killer === null || event.killer === event.victim) continue;
				const killer = model.entities.get(event.killer);
				const victim = model.entities.get(event.victim);
				const a = killer ? positionAt(carrier(model, killer, event.t), event.t) : null;
				const b = victim ? positionAt(victim, event.t) : null;
				if (!a || !b || !killer) continue;
				ctx.strokeStyle = withAlpha(sideStyle(killer.side).edge, 0.9 * (1 - (t - event.t) / KILL_LINE));
				ctx.lineWidth = 1.5;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo(sx(a.x), sy(a.z));
				ctx.lineTo(sx(b.x), sy(b.z));
				ctx.stroke();
				ctx.lineCap = 'butt';
			}
			for (const blast of model.detonations) {
				if (blast.t > t || blast.t < t - DETONATION) continue;
				const k = (t - blast.t) / DETONATION;
				drawBlast(ctx, sx(blast.x), sy(blast.z), (BLAST_RADIUS[blast.kind] ?? 12) * (0.4 + 0.6 * k), 1 - k);
			}
			for (const shot of model.shots) {
				if (shot.t > t || shot.t < t - SHOT) continue;
				const shooter = model.entities.get(shot.eid);
				if (!shooter) continue;
				const seat = valueAt(shooter.seats, shot.t, null);
				const at = positionAt(carrier(model, shooter, shot.t), shot.t);
				if (!at) continue;
				drawTracer(ctx, sx(at.x), sy(at.z), shot.heading, seat?.role === 'gunner' ? 26 : 16, 1 - (t - shot.t) / SHOT);
			}
		}

		for (const man of men) {
			if (man.life === 'dead') continue;
			const style = sideStyle(man.entity.side);
			if (man.life === 'unconscious') drawUnconscious(ctx, man.x, man.y, style);
			else drawSoldier(ctx, man.x, man.y, man.h, style);
			hits.push({ eid: man.entity.eid, x: man.x, y: man.y });
		}

		for (const vehicle of vehicles) {
			if (vehicle.wreck) continue;
			const { entity, x, y } = vehicle;
			if (entity.kind === 'tracker') {
				ctx.beginPath();
				ctx.arc(x, y, 4.5, 0, Math.PI * 2);
				ctx.fillStyle = ACCENT;
				ctx.fill();
				ctx.strokeStyle = '#5c5024';
				ctx.lineWidth = 1.25;
				ctx.stroke();
				if (layers.names) plates.push({ text: labelFor(entity), anchor: x + 10, y });
			} else {
				drawVehicle(ctx, x, y, sideStyle(entity.side), false);
				const crew = crews.get(entity.eid);
				if (crew) drawCrew(ctx, x, y, crew);
				if (layers.names) plates.push({ text: labelFor(entity), anchor: x + 19, y });
			}
			hits.push({ eid: entity.eid, x, y });
		}

		const wide = view.scale < SQUADS_BELOW;
		if (wide) {
			// Squads standing together are set side by side, as on a paper map, rather than
			// drawn over one another.
			const placed: { x: number; y: number }[] = [];
			const ordered = [...squads].map(([key, squad]) => ({ key, side: squad.side, x: squad.x / squad.n, y: squad.top - 22 })).sort((a, b) => a.x - b.x);
			for (const squad of ordered) {
				while (placed.some((p) => Math.abs(p.x - squad.x) < 24 && Math.abs(p.y - squad.y) < 24)) squad.x += 26;
				placed.push(squad);
				drawSquad(ctx, squad.x, squad.y, sideStyle(squad.side));
			}
			if (layers.names) {
				for (const squad of ordered) plates.push({ text: callsignFor(squad.key), anchor: squad.x + 17, y: squad.y, stack: true });
			}
		} else if (layers.names) {
			for (const man of men) {
				if (man.life === 'dead' || man.entity.eid === follow) continue;
				plates.push({ text: labelFor(man.entity), anchor: man.x + 10, y: man.y });
			}
		}

		// The followed unit's name is always shown, to its left, and claims its place first.
		let followedPlate: Plate | null = null;
		if (focusEntity && focus) {
			const x = sx(focus.x);
			const y = sy(focus.z);
			const onVehicle = focusEntity !== followed;
			drawBrackets(ctx, x, y, onVehicle || focusEntity.kind !== 'man' ? 18 : 13);
			if (followed) followedPlate = { text: labelFor(followed), anchor: x - (onVehicle || followed.kind !== 'man' ? 23 : 18), y, align: 'right', outlined: true };
		}
		const taken: LabelBox[] = [];
		for (const plate of followedPlate ? [followedPlate, ...plates] : plates) {
			// A callsign that would cover another tries the rows just below and above first.
			for (const dy of plate.stack ? [0, 17, -17, 34] : [0]) {
				if (drawPlate(ctx, plate.text, plate.anchor, plate.y + dy, { align: plate.align, outlined: plate.outlined, muted: plate.muted, taken })) break;
			}
		}

		drawRulers(ctx, w, h, view.scale, sx, sy, left, right, bottom, top);

		const metres = SCALE_LENGTHS.filter((m) => m * view.scale <= 160).pop() ?? SCALE_LENGTHS[0];
		const unit = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
		if (scaleBarRef.current) scaleBarRef.current.style.width = `${Math.round(metres * view.scale)}px`;
		// The middle figure only fits once the bar is long enough to keep it clear of the ends.
		if (scaleHalfRef.current) scaleHalfRef.current.textContent = metres * view.scale >= 120 ? String(metres >= 2000 ? metres / 2000 : metres / 2) : '';
		if (scaleFullRef.current) scaleFullRef.current.textContent = unit(metres);

		hitsRef.current = hits;
	}, [model, t, relief, topo, follow, layers, sideStyle, labelFor, callsignFor, contested]);

	useEffect(() => {
		drawRef.current = draw;
		draw();
	}, [draw]);

	useEffect(() => {
		const wrap = wrapRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;
		const observer = new ResizeObserver(() => {
			const rect = wrap.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			sizeRef.current = { w: rect.width, h: rect.height, dpr };
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);
			if (!viewRef.current) fit();
			else drawRef.current();
		});
		observer.observe(wrap);
		return () => observer.disconnect();
	}, [fit]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const view = viewRef.current;
			if (!view) return;
			const rect = canvas.getBoundingClientRect();
			const { w, h } = sizeRef.current;
			const px = event.clientX - rect.left;
			const py = event.clientY - rect.top;
			const wx = view.cx + (px - w / 2) / view.scale;
			const wz = view.cz - (py - h / 2) / view.scale;
			const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * Math.exp(-event.deltaY * 0.0015)));
			view.scale = scale;
			view.cx = wx - (px - w / 2) / scale;
			view.cz = wz + (py - h / 2) / scale;
			drawRef.current();
		};
		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => canvas.removeEventListener('wheel', onWheel);
	}, []);

	const showPointer = (clientX: number, clientY: number, target: HTMLCanvasElement) => {
		const view = viewRef.current;
		if (!view || !pointerRef.current) return;
		const rect = target.getBoundingClientRect();
		const { w, h } = sizeRef.current;
		const x = view.cx + (clientX - rect.left - w / 2) / view.scale;
		const z = view.cz - (clientY - rect.top - h / 2) / view.scale;
		pointerRef.current.textContent = gridReference(x, z);
	};

	const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.x = event.clientX;
		drag.y = event.clientY;
		drag.moved = false;
		drag.pinch = null;
	};

	const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		showPointer(event.clientX, event.clientY, event.currentTarget);
		const drag = dragRef.current;
		const view = viewRef.current;
		if (!drag.pointers.has(event.pointerId) || !view) return;
		drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (drag.pointers.size === 2) {
			const [p, q] = [...drag.pointers.values()];
			const distance = Math.hypot(p.x - q.x, p.y - q.y);
			if (drag.pinch) view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * (distance / drag.pinch)));
			drag.pinch = distance;
			drag.moved = true;
			drawRef.current();
			return;
		}
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;
		if (!drag.moved && follow !== null) onFollow(null);
		drag.moved = true;
		view.cx -= dx / view.scale;
		view.cz += dy / view.scale;
		drag.x = event.clientX;
		drag.y = event.clientY;
		drawRef.current();
	};

	const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		drag.pointers.delete(event.pointerId);
		if (drag.pointers.size > 0) return;
		drag.pinch = null;
		if (drag.moved) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		let best: { eid: number; d: number } | null = null;
		for (const hit of hitsRef.current) {
			const d = Math.hypot(hit.x - x, hit.y - y);
			if (d <= 12 && (!best || d < best.d)) best = { eid: hit.eid, d };
		}
		if (best) onFollow(best.eid);
	};

	return (
		<div ref={wrapRef} className="absolute inset-0">
			<canvas
				ref={canvasRef}
				role="img"
				aria-label={ariaLabel}
				className="block h-full w-full touch-none select-none"
				style={{ cursor: 'grab' }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onPointerLeave={() => {
					if (pointerRef.current) pointerRef.current.textContent = '— —';
				}}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute bottom-[12px] left-[44px] z-[3] flex items-center gap-[12px] rounded-[4px] border border-[#2c2c2c] bg-[rgba(10,10,10,0.9)] px-[10px] py-[6px]"
			>
				<div ref={scaleBarRef} className="flex w-[96px] flex-col gap-[3px]">
					<div className="relative h-[12px] text-[11px] leading-[12px] tabular-nums text-neutral-300">
						<span className="absolute left-0">0</span>
						<span ref={scaleHalfRef} className="absolute left-1/2 -translate-x-1/2" />
						<span ref={scaleFullRef} className="absolute right-0 whitespace-nowrap" />
					</div>
					<div className="flex h-[5px] border border-neutral-100">
						<span className="flex-1 bg-neutral-100" />
						<span className="flex-1" />
					</div>
				</div>
				<span className="w-px self-stretch bg-[#2c2c2c]" />
				<div className="flex items-center gap-[6px] text-[12px] font-semibold leading-[16px] text-neutral-100">
					<span className="flex text-neutral-400">
						<Icon.Crosshair size={16} />
					</span>
					<span ref={pointerRef} className="tabular-nums">
						— —
					</span>
				</div>
			</div>
		</div>
	);
}

function centroid(points: number[]): [number, number] {
	let x = 0;
	let z = 0;
	const n = points.length / 2;
	for (let i = 0; i < points.length; i += 2) {
		x += points[i];
		z += points[i + 1];
	}
	return [x / n, z / n];
}

/** A seated character shoots and kills from where its vehicle is. */
function carrier(model: ReplayModel, entity: Entity, t: number): Entity {
	const seat = valueAt(entity.seats, t, null);
	return (seat && model.entities.get(seat.vehicle)) || entity;
}

// Rulers along the top and left edges, labelled like the in-game grid reference.
function drawRulers(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	scale: number,
	sx: (x: number) => number,
	sy: (z: number) => number,
	left: number,
	right: number,
	bottom: number,
	top: number
) {
	const step = RULER_STEPS.find((s) => s * scale >= 36) ?? RULER_STEPS[RULER_STEPS.length - 1];
	const label = (m: number) => String(Math.round(m / 100)).padStart(3, '0');
	ctx.fillStyle = 'rgba(245,245,245,0.88)';
	ctx.fillRect(0, 0, w, RULER_TOP);
	ctx.fillRect(0, RULER_TOP, RULER_LEFT, h - RULER_TOP);
	ctx.fillStyle = 'rgba(20,20,20,0.2)';
	ctx.fillRect(RULER_LEFT, RULER_TOP - 1, w - RULER_LEFT, 1);
	ctx.fillRect(RULER_LEFT - 1, RULER_TOP, 1, h - RULER_TOP);

	ctx.fillStyle = INK;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
		const px = Math.round(sx(x));
		if (px < RULER_LEFT + 12 || x < 0) continue;
		const km = x % 1000 === 0;
		ctx.fillRect(px, RULER_TOP - (km ? 6 : 4), 1, km ? 6 : 4);
		ctx.font = `${km ? 700 : 500} 11px Inter, ui-sans-serif, system-ui, sans-serif`;
		ctx.fillText(label(x), px, 8);
	}
	for (let z = Math.ceil(bottom / step) * step; z <= top; z += step) {
		const py = Math.round(sy(z));
		if (py < RULER_TOP + 8 || z < 0) continue;
		const km = z % 1000 === 0;
		ctx.fillRect(RULER_LEFT - (km ? 6 : 4), py, km ? 6 : 4, 1);
		ctx.font = `${km ? 700 : 500} 11px Inter, ui-sans-serif, system-ui, sans-serif`;
		ctx.fillText(label(z), (RULER_LEFT - 6) / 2, py);
	}
	ctx.textAlign = 'start';
	ctx.textBaseline = 'alphabetic';
}
