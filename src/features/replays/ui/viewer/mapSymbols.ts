import { DEAD_STYLE, withAlpha, type SideStyle } from './sideStyle';

// The map's unit symbols, after the community marker standard: the side's colour as the
// fill, a dark rim of the same hue as the edge, so even light blue holds on the light relief.

export const ACCENT = '#d2b853';
export const INK = '#141414';
export const FIRE = '#c2410c';
export const LABEL_FONT = '600 11px Inter, ui-sans-serif, system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

function diamond(ctx: Ctx, x: number, y: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x, y - r);
	ctx.lineTo(x + r, y);
	ctx.lineTo(x, y + r);
	ctx.lineTo(x - r, y);
	ctx.closePath();
}

/**
 * How large unit symbols are drawn at a zoom (pixels per metre). They grow a little as the
 * view closes in, so a soldier is easy to pick out up close, and shrink on the wide view,
 * where a hundred of them must not run together.
 */
export function symbolScale(pixelsPerMetre: number): number {
	return Math.min(1.25, Math.max(0.9, 0.85 + 0.25 * Math.log2(pixelsPerMetre / 0.5)));
}

/** Draws a symbol in its own frame: the origin at (x, y), every length times k. */
function at(ctx: Ctx, x: number, y: number, k: number, draw: () => void) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(k, k);
	draw();
	ctx.restore();
}

// The sizes below are the symbols at scale 1, about 1.2 pixels per metre.

// A dot of radius 6.5 with its nose 12.5 out along the heading; the sides are tangents.
// Built on first use: the module is also evaluated while the page renders on the server.
const SOLDIER_R = 6.5;
const SOLDIER_NOSE = 12.5;
let soldierPath: Path2D | null = null;

function soldier(): Path2D {
	if (soldierPath) return soldierPath;
	const a = Math.acos(SOLDIER_R / SOLDIER_NOSE);
	const path = new Path2D();
	path.moveTo(0, -SOLDIER_NOSE);
	path.lineTo(SOLDIER_R * Math.sin(a), -SOLDIER_R * Math.cos(a));
	path.arc(0, 0, SOLDIER_R, a - Math.PI / 2, Math.PI * 1.5 - a);
	path.closePath();
	soldierPath = path;
	return path;
}

/** Heading in degrees clockwise from north. */
export function drawSoldier(ctx: Ctx, x: number, y: number, heading: number, style: SideStyle, k: number) {
	const path = soldier();
	at(ctx, x, y, k, () => {
		ctx.rotate((heading * Math.PI) / 180);
		ctx.fillStyle = style.fill;
		ctx.fill(path);
		ctx.strokeStyle = style.edge;
		ctx.lineWidth = 1.5;
		ctx.lineJoin = 'round';
		ctx.stroke(path);
	});
}

export function drawUnconscious(ctx: Ctx, x: number, y: number, style: SideStyle, k: number) {
	at(ctx, x, y, k, () => {
		ctx.beginPath();
		ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
		ctx.strokeStyle = style.edge;
		ctx.lineWidth = 1.25;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		ctx.strokeStyle = style.fill;
		ctx.lineWidth = 2.5;
		ctx.stroke();
	});
}

export function drawCorpse(ctx: Ctx, x: number, y: number, k: number) {
	at(ctx, x, y, k, () => {
		ctx.globalAlpha = 0.9;
		ctx.beginPath();
		ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
		ctx.fillStyle = DEAD_STYLE.fill;
		ctx.fill();
		ctx.strokeStyle = DEAD_STYLE.edge;
		ctx.lineWidth = 1.25;
		ctx.stroke();
	});
}

/** The squad frame: a 30 px diamond quartered by lines joining its edge midpoints. */
export function drawSquad(ctx: Ctx, x: number, y: number, style: SideStyle, k: number) {
	const r = 15;
	const m = r / 2;
	at(ctx, x, y, k, () => {
		diamond(ctx, 0, 0, r);
		ctx.fillStyle = style.fill;
		ctx.fill();
		ctx.strokeStyle = style.edge;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(-m, -m);
		ctx.lineTo(m, m);
		ctx.moveTo(m, -m);
		ctx.lineTo(-m, m);
		ctx.lineWidth = 1.5;
		ctx.stroke();
	});
}

/** The vehicle frame: a 36 px diamond around an oval; a wreck is a smaller grey frame. */
export function drawVehicle(ctx: Ctx, x: number, y: number, style: SideStyle, wreck: boolean, k: number) {
	const size = wreck ? 30 : 36;
	const r = size / 2;
	const colors = wreck ? DEAD_STYLE : style;
	at(ctx, x, y, k, () => {
		if (wreck) ctx.globalAlpha = 0.9;
		diamond(ctx, 0, 0, r);
		ctx.fillStyle = colors.fill;
		ctx.fill();
		ctx.strokeStyle = colors.edge;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.beginPath();
		ctx.ellipse(0, 0, size * 0.2, size * 0.11, 0, 0, Math.PI * 2);
		ctx.lineWidth = 1.5;
		ctx.stroke();
	});
}

/** How many are aboard, in a badge on the vehicle frame's upper right. */
export function drawCrew(ctx: Ctx, x: number, y: number, count: number, k: number) {
	at(ctx, x, y, k, () => {
		ctx.beginPath();
		ctx.roundRect(9, -30, 17, 17, 3);
		ctx.fillStyle = '#0a0a0a';
		ctx.fill();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1.25;
		ctx.stroke();
		ctx.font = '700 12px Inter, ui-sans-serif, system-ui, sans-serif';
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(count), 17.5, -21);
	});
}

/** Corner brackets around the selected unit: s is half the box, before scaling. */
export function drawBrackets(ctx: Ctx, x: number, y: number, s: number, k: number) {
	const arm = 9;
	at(ctx, x, y, k, () => {
		ctx.beginPath();
		for (const [dx, dy] of [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1],
		]) {
			ctx.moveTo(dx * s, dy * (s - arm));
			ctx.lineTo(dx * s, dy * s);
			ctx.lineTo(dx * (s - arm), dy * s);
		}
		ctx.lineCap = 'square';
		ctx.strokeStyle = '#0a0a0a';
		ctx.lineWidth = 5;
		ctx.stroke();
		ctx.strokeStyle = ACCENT;
		ctx.lineWidth = 2.5;
		ctx.stroke();
	});
}

/** Sizes the map uses around the symbols: where labels start, how far a click reaches. */
export const SYMBOL = {
	soldierLabel: 14,
	corpseLabel: 9,
	vehicleLabel: 24,
	squadLabel: 21,
	squadAbove: 30,
	squadSpacing: 36,
	bracketMan: 18,
	bracketVehicle: 25,
	hit: 16,
};

export function drawTracer(ctx: Ctx, x: number, y: number, heading: number, length: number, opacity: number, k: number) {
	const a = (heading * Math.PI) / 180;
	const dx = Math.sin(a);
	const dy = -Math.cos(a);
	const from = (SOLDIER_NOSE + 1) * k;
	const to = from + length * k;
	ctx.beginPath();
	ctx.moveTo(x + dx * from, y + dy * from);
	ctx.lineTo(x + dx * to, y + dy * to);
	ctx.strokeStyle = withAlpha(FIRE, opacity);
	ctx.lineWidth = 2;
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
