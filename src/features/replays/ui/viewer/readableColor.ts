// Side colours come from each recording and can be dark (FIA's #007014); as text on the
// viewer's near-black panels they are lightened until they read at 4.5:1.

const PANEL = [11, 13, 16];

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: number[]): number {
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number[], b: number[]): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const cache = new Map<string, string>();

export function readableOnDark(color: string): string {
	const known = cache.get(color);
	if (known) return known;
	const match = /^#([0-9a-f]{6})/i.exec(color);
	if (!match) return color;
	const rgb = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
	let mixed = rgb;
	for (let k = 0; k <= 1 && contrast(mixed, PANEL) < 4.5; k += 0.05) {
		mixed = rgb.map((v) => Math.round(v + (255 - v) * k));
	}
	const out = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
	cache.set(color, out);
	return out;
}
