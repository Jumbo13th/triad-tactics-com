// Recordings carry colours as the game stores them, in linear light; the game shows them
// sRGB-encoded. Converting once makes the map match the game and the community marker
// icons, which were baked from the in-game colours.

export type SideStyle = { fill: string; edge: string; text: string };

/** The marker standard's black: corpses, wrecks, anything destroyed. */
export const DEAD_STYLE: SideStyle = { fill: '#717171', edge: '#3a3a3a', text: '#a3a3a3' };
/** Units or zones no side owns. */
export const NEUTRAL_STYLE: SideStyle = { fill: '#a3a3a3', edge: '#555555', text: '#d4d4d4' };

// Side-coloured text sits on the panels' #121212; 5.5:1 keeps the darker reds legible.
const PANEL = [18, 18, 18];
const TEXT_CONTRAST = 5.5;
// Every marker icon carries a rim at about half its fill's brightness.
const EDGE = 0.52;

function parseHex(color: string): number[] | null {
	const match = /^#([0-9a-f]{6})/i.exec(color);
	return match ? [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16)) : null;
}

function toHex(rgb: number[]): string {
	return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function encode(linear: number): number {
	const c = linear / 255;
	const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
	return s * 255;
}

function decode(value: number): number {
	const c = value / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: number[]): number {
	return 0.2126 * decode(rgb[0]) + 0.7152 * decode(rgb[1]) + 0.0722 * decode(rgb[2]);
}

function contrast(a: number[], b: number[]): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** A recorded colour as the game shows it. Alpha, when present, is kept as it is. */
export function displayColor(recorded: string): string {
	const rgb = parseHex(recorded);
	if (!rgb) return recorded;
	return toHex(rgb.map(encode)) + recorded.slice(7, 9);
}

function readable(rgb: number[]): string {
	let mixed = rgb;
	for (let k = 0.05; k <= 1 && contrast(mixed, PANEL) < TEXT_CONTRAST; k += 0.05) {
		mixed = rgb.map((v) => v + (255 - v) * k);
	}
	return toHex(mixed);
}

const styles = new Map<string, SideStyle>();

export function sideStyle(recorded: string): SideStyle {
	const known = styles.get(recorded);
	if (known) return known;
	const rgb = parseHex(displayColor(recorded));
	const style = rgb ? { fill: toHex(rgb), edge: toHex(rgb.map((v) => v * EDGE)), text: readable(rgb) } : NEUTRAL_STYLE;
	styles.set(recorded, style);
	return style;
}

/** `#rrggbb` (any trailing alpha dropped) as rgba() at the given opacity. */
export function withAlpha(color: string, alpha: number): string {
	const rgb = parseHex(color);
	return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color;
}

/** Glyphs of the in-game marker dialog; the website has each as a tinted icon. */
export const MARKER_ICONS: ReadonlySet<string> = new Set(['dot', 'squad', 'fire-team', 'vehicle', 'landing', 'flag', 'exclamation', 'question']);

export type MarkerColor = 'red' | 'blue' | 'green' | 'yellow' | 'black';

/**
 * Which of the dialog's five colours a recorded marker colour is. Three of them are the
 * factions' own colours, so they are told apart by hue rather than matched exactly.
 */
export function markerColor(recorded: string | null): MarkerColor | null {
	const rgb = recorded ? parseHex(displayColor(recorded)) : null;
	if (!rgb) return null;
	const [r, g, b] = rgb.map((v) => v / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const lightness = (max + min) / 2;
	const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
	if (saturation < 0.25 || max < 0.2) return 'black';
	const d = max - min;
	const hue = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
	if (hue < 20 || hue >= 330) return 'red';
	if (hue < 75) return 'yellow';
	if (hue < 170) return 'green';
	if (hue < 260) return 'blue';
	return null;
}
