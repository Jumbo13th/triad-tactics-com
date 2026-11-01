import type { ReactNode } from 'react';
import { DEAD_STYLE, type SideStyle } from './sideStyle';

// The panels' small versions of the map symbols, and the viewer's stroke icons.

type GlyphProps = { style: SideStyle; size?: number };

export function DotGlyph({ style, size = 12 }: GlyphProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
			<circle cx="6" cy="6" r="4.4" fill={style.fill} stroke={style.edge} strokeWidth="1.25" />
		</svg>
	);
}

export function UnconsciousGlyph({ style, size = 12 }: GlyphProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
			<circle cx="6" cy="6" r="5.2" fill="none" stroke={style.edge} strokeWidth="1" />
			<circle cx="6" cy="6" r="3.7" fill="#ffffff" stroke={style.fill} strokeWidth="2" />
		</svg>
	);
}

export function DeadGlyph({ size = 12 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
			<circle cx="6" cy="6" r="3" fill={DEAD_STYLE.fill} stroke={DEAD_STYLE.edge} strokeWidth="1" />
		</svg>
	);
}

function diamond(c: number, r: number): string {
	return `M${c} ${c - r}L${c + r} ${c}L${c} ${c + r}L${c - r} ${c}Z`;
}

export function SquadGlyph({ style, size = 16 }: GlyphProps) {
	const c = size / 2;
	const r = c - 1;
	const m = r / 2;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
			<path d={diamond(c, r)} fill={style.fill} stroke={style.edge} strokeWidth="1.25" />
			<path d={`M${c - m} ${c - m}L${c + m} ${c + m}M${c + m} ${c - m}L${c - m} ${c + m}`} stroke={style.edge} strokeWidth="1" />
		</svg>
	);
}

export function VehicleGlyph({ style, size = 16 }: GlyphProps) {
	const c = size / 2;
	const r = c - 1;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
			<path d={diamond(c, r)} fill={style.fill} stroke={style.edge} strokeWidth="1.25" />
			<ellipse cx={c} cy={c} rx={r * 0.43} ry={r * 0.24} fill="none" stroke={style.edge} strokeWidth="1" />
		</svg>
	);
}

export function DiamondGlyph({ style, size = 10 }: GlyphProps) {
	const c = size / 2;
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
			<path d={diamond(c, c - 0.75)} fill={style.fill} stroke={style.edge} strokeWidth="1" />
		</svg>
	);
}

function Stroke({ size, children, width = 2 }: { size: number; children: ReactNode; width?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={width}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className="shrink-0"
		>
			{children}
		</svg>
	);
}

type IconProps = { size?: number };

export const Icon = {
	ChevronLeft: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M15 18l-6-6 6-6" />
		</Stroke>
	),
	ChevronDown: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M6 9l6 6 6-6" />
		</Stroke>
	),
	ChevronRight: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M9 6l6 6-6 6" />
		</Stroke>
	),
	Search: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<circle cx="11" cy="11" r="7" />
			<path d="M20 20l-3.5-3.5" />
		</Stroke>
	),
	Chart: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M5 20V11M12 20V5M19 20v-6" />
		</Stroke>
	),
	Link: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
			<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
		</Stroke>
	),
	Check: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</Stroke>
	),
	Play: ({ size = 18 }: IconProps) => (
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
			<path d="M8 5v14l11-7z" fill="currentColor" />
		</svg>
	),
	Pause: ({ size = 18 }: IconProps) => (
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
			<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
			<rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
		</svg>
	),
	Plus: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 5v14M5 12h14" />
		</Stroke>
	),
	Minus: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M5 12h14" />
		</Stroke>
	),
	Fit: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
		</Stroke>
	),
	Layers: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 3l9 5-9 5-9-5 9-5z" />
			<path d="M3 13l9 5 9-5" />
		</Stroke>
	),
	Legend: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M6.5 3.5l3 3-3 3-3-3z" />
			<circle cx="6.5" cy="16.5" r="2.5" />
			<path d="M13 6.5h8M13 16.5h8" />
		</Stroke>
	),
	Close: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M6 6l12 12M18 6L6 18" />
		</Stroke>
	),
	Crosshair: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<circle cx="12" cy="12" r="6" />
			<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
		</Stroke>
	),
	Follow: ({ size = 18 }: IconProps) => (
		<Stroke size={size}>
			<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
			<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
		</Stroke>
	),
	Retry: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M20 12a8 8 0 1 1-2.34-5.66" />
			<path d="M20 4v5h-5" />
		</Stroke>
	),
	Warning: ({ size = 24 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 3l9.5 17h-19z" />
			<path d="M12 10v4.5M12 17.5v.5" />
		</Stroke>
	),
	Kill: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<circle cx="12" cy="12" r="6.5" />
			<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" />
		</Stroke>
	),
	VehicleKill: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 3l9 9-9 9-9-9z" />
			<ellipse cx="12" cy="12" rx="4" ry="2.2" />
		</Stroke>
	),
	Down: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
		</Stroke>
	),
	Up: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />
		</Stroke>
	),
	Flag: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />
		</Stroke>
	),
	Start: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<circle cx="12" cy="12" r="9" />
			<path d="M10 8.5l5 3.5-5 3.5z" />
		</Stroke>
	),
	Freeze: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<path d="M10 9v6M14 9v6" />
		</Stroke>
	),
	Thaw: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<rect x="4" y="4" width="16" height="16" rx="2" />
			<path d="M10 8.5l5 3.5-5 3.5z" />
		</Stroke>
	),
	Trigger: ({ size = 16 }: IconProps) => (
		<Stroke size={size}>
			<path d="M13 3L5 14h6l-1 7 8-11h-6z" />
		</Stroke>
	),
};
