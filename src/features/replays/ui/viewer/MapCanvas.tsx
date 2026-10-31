'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { positionAt, segmentAt, valueAt, type Entity, type ReplayModel } from '../../domain/replayFormat';
import { drawTopo, type TopoLayers } from './topoDraw';

export type MapLayers = { names: boolean; fire: boolean; markers: boolean; areas: boolean };

export type MapCanvasHandle = { fit: () => void; zoom: (factor: number) => void };

type View = { cx: number; cz: number; scale: number };

type Props = {
	model: ReplayModel;
	t: number;
	relief: HTMLImageElement | null;
	topo: TopoLayers | null;
	follow: number | null;
	layers: MapLayers;
	sideColor: (side: string | null) => string;
	labelFor: (entity: Entity) => string;
	callsignFor: (groupKey: string) => string;
	onFollow: (eid: number | null) => void;
	handleRef?: Ref<MapCanvasHandle>;
	ariaLabel: string;
};

const DEAD_VISIBLE = 600;
const KILL_LINE = 30;
const DETONATION = 20;
const SHOT = 10;
const MIN_SCALE = 0.02;
const MAX_SCALE = 12;
const ACCENT = '#d2b853';
const NEUTRAL = '#6b7480';

function hexAlpha(color: string, alpha: number): string {
	const base = color.length >= 7 ? color.slice(0, 7) : color;
	return `${base}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

// The community's marker standard: a diamond frame, split in four for a squad, with an
// oval inside for a vehicle.
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - r);
	ctx.lineTo(x + r, y);
	ctx.lineTo(x, y + r);
	ctx.lineTo(x - r, y);
	ctx.closePath();
}

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

export default function MapCanvas(props: Props) {
	const { model, t, relief, topo, follow, layers, sideColor, labelFor, callsignFor, onFollow, handleRef, ariaLabel } = props;
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
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
		const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
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

		if (follow !== null) {
			const target = model.entities.get(follow);
			const seat = target ? valueAt(target.seats, t, null) : null;
			const focus = target ? positionAt(seat ? (model.entities.get(seat.vehicle) ?? target) : target, t) : null;
			if (focus) {
				view.cx = focus.x;
				view.cz = focus.z;
			}
		}

		const sx = (x: number) => (x - view.cx) * view.scale + w / 2;
		const sy = (z: number) => (view.cz - z) * view.scale + h / 2;
		const [minX, minZ, maxX, maxZ] = model.bounds;

		// Without a relief image the ground is map paper, so the recorded area colours (often
		// black outlines) stay visible.
		ctx.fillStyle = relief ? '#c3e6ec' : '#d5d9d4';
		ctx.fillRect(0, 0, w, h);
		if (relief && maxX > minX) {
			ctx.imageSmoothingEnabled = view.scale < 2;
			ctx.drawImage(relief, sx(minX), sy(maxZ), (maxX - minX) * view.scale, (maxZ - minZ) * view.scale);
		}
		if (topo) drawTopo(ctx, topo, sx, sy, view.scale);

		// A kilometre grid like the in-game map's, with 100 m lines once zoomed in.
		const step = view.scale > 0.6 ? 100 : 1000;
		ctx.lineWidth = 1;
		const from = (v: number) => Math.floor(v / step) * step;
		const left = view.cx - w / 2 / view.scale;
		const right = view.cx + w / 2 / view.scale;
		const top = view.cz + h / 2 / view.scale;
		const bottom = view.cz - h / 2 / view.scale;
		for (let x = from(left); x <= right; x += step) {
			ctx.strokeStyle = x % 1000 === 0 ? 'rgba(20,28,36,0.28)' : 'rgba(20,28,36,0.10)';
			ctx.beginPath();
			ctx.moveTo(Math.round(sx(x)) + 0.5, 0);
			ctx.lineTo(Math.round(sx(x)) + 0.5, h);
			ctx.stroke();
		}
		for (let z = from(bottom); z <= top; z += step) {
			ctx.strokeStyle = z % 1000 === 0 ? 'rgba(20,28,36,0.28)' : 'rgba(20,28,36,0.10)';
			ctx.beginPath();
			ctx.moveTo(0, Math.round(sy(z)) + 0.5);
			ctx.lineTo(w, Math.round(sy(z)) + 0.5);
			ctx.stroke();
		}

		const textColor = '#141a20';
		// Labels skip a spot another label already took: squads standing together would
		// otherwise print their callsigns over each other.
		const taken: { x: number; y: number; w: number }[] = [];
		const label = (text: string, x: number, y: number, bold = false, always = false) => {
			ctx.font = `${bold ? 600 : 500} 11px Inter, system-ui, sans-serif`;
			const width = ctx.measureText(text).width;
			const box = { x: x - 4, y: y - 9, w: width + 8 };
			if (!always && taken.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && Math.abs(o.y - box.y) < 16)) return;
			taken.push(box);
			ctx.fillStyle = 'rgba(14,17,20,0.82)';
			ctx.fillRect(x - 4, y - 9, width + 8, 16);
			ctx.fillStyle = '#f4f5f6';
			ctx.fillText(text, x, y + 3);
		};

		if (layers.areas) {
			for (const area of model.areas.values()) {
				if (!valueAt(area.shown, t, true) || area.points.length < 4) continue;
				ctx.beginPath();
				ctx.moveTo(sx(area.points[0]), sy(area.points[1]));
				for (let i = 2; i < area.points.length; i += 2) ctx.lineTo(sx(area.points[i]), sy(area.points[i + 1]));
				if (!area.open) {
					ctx.closePath();
					if (area.fill) {
						ctx.fillStyle = area.fill;
						ctx.fill();
					}
				}
				ctx.strokeStyle = area.outline ?? 'rgba(0,0,0,0.6)';
				ctx.lineWidth = Math.max(1, Math.min(4, area.width));
				ctx.stroke();
			}
			for (const zone of model.zones.values()) {
				if (zone.points.length < 6) continue;
				const holder = valueAt(zone.holders, t, null);
				const color = holder ? sideColor(holder) : NEUTRAL;
				ctx.beginPath();
				ctx.moveTo(sx(zone.points[0]), sy(zone.points[1]));
				for (let i = 2; i < zone.points.length; i += 2) ctx.lineTo(sx(zone.points[i]), sy(zone.points[i + 1]));
				ctx.closePath();
				ctx.fillStyle = hexAlpha(color, 0.28);
				ctx.fill();
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.stroke();
				if (layers.names && zone.label) {
					let cx = 0;
					let cz = 0;
					const n = zone.points.length / 2;
					for (let i = 0; i < zone.points.length; i += 2) {
						cx += zone.points[i];
						cz += zone.points[i + 1];
					}
					label(zone.label, sx(cx / n) + 10, sy(cz / n) - 14, true);
				}
			}
		}

		if (layers.markers) {
			for (const marker of model.markers.values()) {
				if (marker.placedAt > t || (marker.removedAt !== null && marker.removedAt <= t)) continue;
				const x = sx(marker.x);
				const y = sy(marker.z);
				ctx.fillStyle = marker.color ?? '#e3342f';
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				diamond(ctx, x, y, 6);
				ctx.fill();
				ctx.stroke();
				if (marker.text) {
					ctx.font = '600 11px Inter, system-ui, sans-serif';
					ctx.fillStyle = textColor;
					ctx.fillText(marker.text, x + 9, y + 4);
				}
			}
		}

		if (layers.fire) {
			for (const shot of model.shots) {
				if (shot.t > t || shot.t < t - SHOT) continue;
				const shooter = model.entities.get(shot.eid);
				const at = shooter ? positionAt(shooter, shot.t) : null;
				if (!at) continue;
				const a = (shot.heading * Math.PI) / 180;
				const fade = 1 - (t - shot.t) / SHOT;
				ctx.strokeStyle = `rgba(242,193,78,${0.9 * fade})`;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(sx(at.x), sy(at.z));
				ctx.lineTo(sx(at.x) + Math.sin(a) * 22, sy(at.z) - Math.cos(a) * 22);
				ctx.stroke();
			}
			for (const blast of model.detonations) {
				if (blast.t > t || blast.t < t - DETONATION) continue;
				const k = (t - blast.t) / DETONATION;
				ctx.beginPath();
				ctx.arc(sx(blast.x), sy(blast.z), 5 + k * 14, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255,140,40,${0.3 * (1 - k)})`;
				ctx.fill();
				ctx.strokeStyle = `rgba(255,140,40,${1 - k})`;
				ctx.lineWidth = 2.5;
				ctx.stroke();
			}
			for (const event of model.events) {
				if (event.type !== 'kill' || event.t > t || event.t < t - KILL_LINE || event.killer === null) continue;
				const killer = model.entities.get(event.killer);
				const victim = model.entities.get(event.victim);
				const a = killer ? positionAt(killer, event.t) : null;
				const b = victim ? positionAt(victim, event.t) : null;
				if (!a || !b || !killer) continue;
				ctx.strokeStyle = hexAlpha(sideColor(killer.side), 0.95 * (1 - (t - event.t) / KILL_LINE));
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.moveTo(sx(a.x), sy(a.z));
				ctx.lineTo(sx(b.x), sy(b.z));
				ctx.stroke();
			}
		}

		const segment = segmentAt(model, t);
		const hits: { eid: number; x: number; y: number }[] = [];
		const crews = new Map<number, number>();
		const squads = new Map<string, { x: number; z: number; n: number; side: string | null }>();
		const men: { entity: Entity; x: number; y: number; h: number; life: string }[] = [];

		for (const entity of model.entities.values()) {
			if (entity.kind !== 'man' || entity.appearedAt > t || (entity.removedAt !== null && entity.removedAt <= t)) continue;
			const life = valueAt(entity.life, t, 'alive');
			if (life === 'dead') {
				const died = entity.life[entity.life.length - 1];
				if (!died || t - died.t > DEAD_VISIBLE) continue;
			}
			const seat = valueAt(entity.seats, t, null);
			if (seat && life !== 'dead') {
				crews.set(seat.vehicle, (crews.get(seat.vehicle) ?? 0) + 1);
				continue;
			}
			const at = positionAt(entity, t);
			if (!at) continue;
			men.push({ entity, x: sx(at.x), y: sy(at.z), h: at.h, life });
			const group = entity.groups.get(segment);
			if (group && life !== 'dead') {
				const squad = squads.get(group) ?? { x: 0, z: 0, n: 0, side: entity.side };
				squad.x += at.x;
				squad.z += at.z;
				squad.n++;
				squads.set(group, squad);
			}
		}

		for (const entity of model.entities.values()) {
			if (entity.kind === 'man' || entity.appearedAt > t || (entity.removedAt !== null && entity.removedAt <= t)) continue;
			const at = positionAt(entity, t);
			if (!at) continue;
			const x = sx(at.x);
			const y = sy(at.z);
			if (entity.kind === 'tracker') {
				if (layers.names) label(labelFor(entity), x + 8, y);
				ctx.fillStyle = ACCENT;
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
				continue;
			}
			const dead = valueAt(entity.life, t, 'alive') === 'dead';
			const color = dead ? NEUTRAL : sideColor(entity.side);
			ctx.fillStyle = color;
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1.5;
			diamond(ctx, x, y, 9);
			ctx.fill();
			ctx.stroke();
			ctx.beginPath();
			ctx.ellipse(x, y, 4.5, 2.6, 0, 0, Math.PI * 2);
			ctx.strokeStyle = dead ? '#1d232b' : '#0b0d10';
			ctx.lineWidth = 1.3;
			ctx.stroke();
			const crew = crews.get(entity.eid);
			if (crew) {
				ctx.fillStyle = '#0b0d10';
				ctx.beginPath();
				ctx.arc(x + 9, y - 8, 7, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#ffffff';
				ctx.font = '700 9px Inter, system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(String(crew), x + 9, y - 5);
				ctx.textAlign = 'start';
			}
			if (follow !== null) {
				const target = model.entities.get(follow);
				const seat = target ? valueAt(target.seats, t, null) : null;
				if (seat?.vehicle === entity.eid) {
					ctx.strokeStyle = ACCENT;
					ctx.lineWidth = 2.5;
					diamond(ctx, x, y, 13);
					ctx.stroke();
				}
			}
			hits.push({ eid: entity.eid, x, y });
		}

		for (const man of men) {
			const color = sideColor(man.entity.side);
			if (man.life === 'dead') {
				ctx.strokeStyle = 'rgba(40,46,54,0.85)';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(man.x - 3.5, man.y - 3.5);
				ctx.lineTo(man.x + 3.5, man.y + 3.5);
				ctx.moveTo(man.x + 3.5, man.y - 3.5);
				ctx.lineTo(man.x - 3.5, man.y + 3.5);
				ctx.stroke();
				continue;
			}
			const a = (man.h * Math.PI) / 180;
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(man.x, man.y);
			ctx.lineTo(man.x + Math.sin(a) * 9, man.y - Math.cos(a) * 9);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(man.x, man.y, 4.5, 0, Math.PI * 2);
			if (man.life === 'unconscious') {
				ctx.fillStyle = '#ffffff';
				ctx.fill();
				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				ctx.stroke();
			} else {
				ctx.fillStyle = color;
				ctx.fill();
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
			if (man.entity.eid === follow) {
				ctx.beginPath();
				ctx.arc(man.x, man.y, 8.5, 0, Math.PI * 2);
				ctx.strokeStyle = ACCENT;
				ctx.lineWidth = 2.5;
				ctx.stroke();
			}
			hits.push({ eid: man.entity.eid, x: man.x, y: man.y });
		}

		if (layers.names) {
			// Squads by their callsign when the view is wide; soldiers by name when close.
			if (view.scale < 1.2) {
				const placed = [...squads].map(([key, squad]) => ({
					key,
					x: sx(squad.x / squad.n),
					y: sy(squad.z / squad.n) - 22,
					color: sideColor(squad.side),
				}));
				// Every symbol first, so none is drawn over a neighbour's callsign.
				for (const squad of placed) {
					ctx.fillStyle = squad.color;
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 1.5;
					diamond(ctx, squad.x, squad.y, 8);
					ctx.fill();
					ctx.stroke();
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.moveTo(squad.x - 4, squad.y - 4);
					ctx.lineTo(squad.x + 4, squad.y + 4);
					ctx.moveTo(squad.x + 4, squad.y - 4);
					ctx.lineTo(squad.x - 4, squad.y + 4);
					ctx.stroke();
				}
				for (const squad of placed) label(callsignFor(squad.key), squad.x + 12, squad.y);
			} else {
				for (const man of men) {
					if (man.life === 'dead') continue;
					label(labelFor(man.entity), man.x + 9, man.y - 9);
				}
			}
		}
		const followed = follow !== null ? men.find((m) => m.entity.eid === follow) : null;
		if (followed && (!layers.names || view.scale < 1.2)) label(labelFor(followed.entity), followed.x + 11, followed.y - 11, true, true);

		// Scale bar: the largest round length under 120 px.
		const lengths = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
		const metres = lengths.filter((m) => m * view.scale <= 120).pop() ?? 10;
		const px = metres * view.scale;
		ctx.fillStyle = 'rgba(14,17,20,0.85)';
		ctx.fillRect(12, h - 34, px + 70, 22);
		ctx.strokeStyle = '#e7e9ec';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(20, h - 26);
		ctx.lineTo(20, h - 18);
		ctx.lineTo(20 + px, h - 18);
		ctx.lineTo(20 + px, h - 26);
		ctx.stroke();
		ctx.fillStyle = '#e7e9ec';
		ctx.font = '600 11px Inter, system-ui, sans-serif';
		ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 26 + px, h - 18);

		hitsRef.current = hits;
	}, [model, t, relief, topo, follow, layers, sideColor, labelFor, callsignFor]);

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
			/>
		</div>
	);
}
