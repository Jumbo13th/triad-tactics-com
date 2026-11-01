import { DEAD_STYLE, withAlpha, type SideStyle } from './sideStyle';

// The map's unit symbols, after the community marker standard: the side's colour as the
// fill, a dark rim of the same hue as the edge, so even light blue holds on the light relief.

export const ACCENT = '#d2b853';
export const INK = '#141414';
export const FIRE = '#c2410c';
const HALO = 'rgba(255,255,255,0.85)';
const LABEL_FONT = '600 11px Inter, ui-sans-serif, system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

function diamond(ctx: Ctx, x: number, y: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - r);
	ctx.lineTo(x + r, y);
	ctx.lineTo(x, y + r);
	ctx.lineTo(x - r, y);
	ctx.closePath();
}

// A dot of radius 4.5 with its nose 8.5 out along the heading; the sides are tangents.
// Built on first use: the module is also evaluated while the page renders on the server.
let soldierPath: Path2D | null = null;

function soldier(): Path2D {
	if (soldierPath) return soldierPath;
	const r = 4.5;
	const d = 8.5;
	const a = Math.acos(r / d);
	const path = new Path2D();
	path.moveTo(0, -d);
	path.lineTo(r * Math.sin(a), -r * Math.cos(a));
	path.arc(0, 0, r, a - Math.PI / 2, Math.PI * 1.5 - a);
	path.closePath();
	soldierPath = path;
	return path;
}

/** Heading in degrees clockwise from north. */
export function drawSoldier(ctx: Ctx, x: number, y: number, heading: number, style: SideStyle) {
	const path = soldier();
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate((heading * Math.PI) / 180);
	ctx.fillStyle = style.fill;
	ctx.fill(path);
	ctx.strokeStyle = style.edge;
	ctx.lineWidth = 1.25;
	ctx.lineJoin = 'round';
	ctx.stroke(path);
	ctx.restore();
}

export function drawUnconscious(ctx: Ctx, x: number, y: number, style: SideStyle) {
	ctx.beginPath();
	ctx.arc(x, y, 5.5, 0, Math.PI * 2);
	ctx.strokeStyle = style.edge;
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(x, y, 4, 0, Math.PI * 2);
	ctx.fillStyle = '#ffffff';
	ctx.fill();
	ctx.strokeStyle = style.fill;
	ctx.lineWidth = 2;
	ctx.stroke();
}

export function drawCorpse(ctx: Ctx, x: number, y: number) {
	ctx.globalAlpha = 0.9;
	ctx.beginPath();
	ctx.arc(x, y, 3, 0, Math.PI * 2);
	ctx.fillStyle = DEAD_STYLE.fill;
	ctx.fill();
	ctx.strokeStyle = DEAD_STYLE.edge;
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.globalAlpha = 1;
}

/** The squad frame: a 22 px diamond quartered by lines joining its edge midpoints. */
export function drawSquad(ctx: Ctx, x: number, y: number, style: SideStyle) {
	const r = 11;
	const m = r / 2;
	diamond(ctx, x, y, r + 1.75);
	ctx.fillStyle = HALO;
	ctx.fill();
	diamond(ctx, x, y, r);
	ctx.fillStyle = style.fill;
	ctx.fill();
	ctx.strokeStyle = style.edge;
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x - m, y - m);
	ctx.lineTo(x + m, y + m);
	ctx.moveTo(x + m, y - m);
	ctx.lineTo(x - m, y + m);
	ctx.lineWidth = 1.25;
	ctx.stroke();
}

/** The vehicle frame: a 26 px diamond around an oval; a wreck is a smaller grey frame. */
export function drawVehicle(ctx: Ctx, x: number, y: number, style: SideStyle, wreck: boolean) {
	const size = wreck ? 22 : 26;
	const r = size / 2;
	const colors = wreck ? DEAD_STYLE : style;
	if (wreck) ctx.globalAlpha = 0.9;
	else {
		diamond(ctx, x, y, r + 1.75);
		ctx.fillStyle = HALO;
		ctx.fill();
	}
	diamond(ctx, x, y, r);
	ctx.fillStyle = colors.fill;
	ctx.fill();
	ctx.strokeStyle = colors.edge;
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.beginPath();
	ctx.ellipse(x, y, size * 0.2, size * 0.11, 0, 0, Math.PI * 2);
	ctx.lineWidth = 1.25;
	ctx.stroke();
	ctx.globalAlpha = 1;
}

/** How many are aboard, in a badge on the vehicle frame's upper right. */
export function drawCrew(ctx: Ctx, x: number, y: number, count: number) {
	ctx.beginPath();
	ctx.roundRect(x + 6, y - 23, 14, 14, 2);
	ctx.fillStyle = '#0a0a0a';
	ctx.fill();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.font = '700 11px Inter, ui-sans-serif, system-ui, sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.fillText(String(count), x + 13, y - 12);
	ctx.textAlign = 'start';
}

/** Corner brackets on a 26 px box around whatever the camera follows. */
export function drawBrackets(ctx: Ctx, x: number, y: number, s = 13) {
	const arm = 7;
	ctx.beginPath();
	for (const [dx, dy] of [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1],
	]) {
		ctx.moveTo(x + dx * s, y + dy * (s - arm));
		ctx.lineTo(x + dx * s, y + dy * s);
		ctx.lineTo(x + dx * (s - arm), y + dy * s);
	}
	ctx.lineCap = 'square';
	ctx.strokeStyle = '#0a0a0a';
	ctx.lineWidth = 4.5;
	ctx.stroke();
	ctx.strokeStyle = ACCENT;
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.lineCap = 'butt';
}

export function drawTracer(ctx: Ctx, x: number, y: number, heading: number, length: number, opacity: number) {
	const a = (heading * Math.PI) / 180;
	const dx = Math.sin(a);
	const dy = -Math.cos(a);
	ctx.beginPath();
	ctx.moveTo(x + dx * 7, y + dy * 7);
	ctx.lineTo(x + dx * (7 + length), y + dy * (7 + length));
	ctx.strokeStyle = withAlpha(FIRE, opacity);
	ctx.lineWidth = 1.5;
	ctx.lineCap = 'round';
	ctx.stroke();
	ctx.lineCap = 'butt';
}

export function drawBlast(ctx: Ctx, x: number, y: number, radius: number, opacity: number) {
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fillStyle = withAlpha(FIRE, 0.18 * opacity);
	ctx.fill();
	ctx.strokeStyle = withAlpha(FIRE, opacity);
	ctx.lineWidth = 2;
	ctx.stroke();
}

export type LabelBox = { x: number; y: number; w: number; h: number };

/** strong: a living player's name; soft: secondary names; dim: the dead. */
export type PlateTone = 'strong' | 'soft' | 'dim';

const TONES: Record<PlateTone, { font: string; color: string }> = {
	strong: { font: LABEL_FONT, color: '#f5f5f5' },
	soft: { font: '500 11px Inter, ui-sans-serif, system-ui, sans-serif', color: '#d4d4d4' },
	dim: { font: '500 11px Inter, ui-sans-serif, system-ui, sans-serif', color: '#a3a3a3' },
};

/**
 * A name plate: 11 px type on a dark plate. `anchor` is where the plate starts (left) or
 * ends (right) or its middle (center); y is its vertical middle. Returns the box drawn,
 * or null when `taken` already holds an overlapping one; `force` draws it regardless and
 * still claims its place.
 */
export function drawPlate(
	ctx: Ctx,
	text: string,
	anchor: number,
	y: number,
	{
		align = 'left',
		outlined = false,
		tone = 'strong',
		taken = null,
		force = false,
	}: { align?: 'left' | 'right' | 'center'; outlined?: boolean; tone?: PlateTone; taken?: LabelBox[] | null; force?: boolean } = {}
): LabelBox | null {
	const style = TONES[tone];
	ctx.font = style.font;
	const w = Math.ceil(ctx.measureText(text).width) + 10;
	const h = 16;
	const x = align === 'right' ? anchor - w : align === 'center' ? anchor - w / 2 : anchor;
	const box = { x, y: y - h / 2, w, h };
	if (taken) {
		if (!force && taken.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h)) return null;
		taken.push(box);
	}
	ctx.beginPath();
	ctx.roundRect(box.x, box.y, w, h, 2);
	ctx.fillStyle = 'rgba(10,10,10,0.86)';
	ctx.fill();
	if (outlined) {
		ctx.strokeStyle = ACCENT;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(box.x + 0.5, box.y + 0.5, w - 1, h - 1, 2);
		ctx.stroke();
	}
	ctx.fillStyle = style.color;
	ctx.textBaseline = 'middle';
	ctx.fillText(text, box.x + 5, y + 0.5);
	ctx.textBaseline = 'alphabetic';
	return box;
}

/** Marker text: bold ink on a white halo, as players write it on the in-game map. */
export function drawMarkerText(ctx: Ctx, text: string, x: number, y: number) {
	ctx.font = '700 11px Inter, ui-sans-serif, system-ui, sans-serif';
	ctx.textBaseline = 'middle';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = 'rgba(255,255,255,0.95)';
	ctx.lineWidth = 3.5;
	ctx.strokeText(text, x, y);
	ctx.fillStyle = INK;
	ctx.fillText(text, x, y);
	ctx.textBaseline = 'alphabetic';
}

export function drawFallbackMarker(ctx: Ctx, x: number, y: number, color: string) {
	diamond(ctx, x, y, 6);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1.5;
	ctx.stroke();
}

const stripes = new Map<string, CanvasPattern | null>();

/** Diagonal stripes of two sides' fills, for a zone both have units inside. */
export function contestedPattern(ctx: Ctx, a: string, b: string): CanvasPattern | null {
	const key = `${a}|${b}`;
	if (stripes.has(key)) return stripes.get(key) ?? null;
	const tile = document.createElement('canvas');
	tile.width = 8;
	tile.height = 8;
	const t = tile.getContext('2d');
	let pattern: CanvasPattern | null = null;
	if (t) {
		t.fillStyle = withAlpha(a, 0.34);
		t.fillRect(0, 0, 4, 8);
		t.fillStyle = withAlpha(b, 0.34);
		t.fillRect(4, 0, 4, 8);
		pattern = ctx.createPattern(tile, 'repeat');
		pattern?.setTransform(new DOMMatrix().rotate(45));
	}
	stripes.set(key, pattern);
	return pattern;
}
