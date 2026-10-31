import { ROAD_TYPE, type TopoLayers } from '../../domain/topo';

// Draws a terrain's exported map geometry over its relief, in the colours of the game's own
// map (MapPropsDefault.conf). Every entry is one closed path filled under the nonzero rule;
// entries joined from several rings must not be stroked, or the joins would show.

type Shape = { kind: number; points: number[]; minX: number; minZ: number; maxX: number; maxZ: number };

export type PreparedTopo = {
	forests: Shape[];
	water: Shape[];
	roads: Shape[];
	buildings: Shape[];
	/** Simplified roads and water for wide views, where full detail costs time and shows nothing. */
	coarseWater: Shape[];
	coarseRoads: Shape[];
};

export type ViewRect = { left: number; right: number; bottom: number; top: number };

const FOREST = 'rgba(130,225,90,0.33)';
const WATER = '#b5f2fd';
const BUILDING_FILL = '#b4b4b4';
const BUILDING_LINE = '#7d7d7d';
const ROAD_COLOURS: Record<number, string> = {
	[ROAD_TYPE.RUNWAY]: '#e5e5e5',
	[ROAD_TYPE.MAIN]: '#f5eb63',
	[ROAD_TYPE.MINOR]: '#f5f0ae',
	[ROAD_TYPE.TRAIL]: '#c8ae8d',
	[ROAD_TYPE.PATH_TOURIST]: '#ff4b4b',
	[ROAD_TYPE.PATH_GENERAL]: '#6f6f6f',
	[ROAD_TYPE.BRIDGE]: '#f5f0ae',
};
// Lower classes first so main roads and runways lie on top where they cross; bridge decks last.
const ROAD_ORDER = [
	ROAD_TYPE.PATH_GENERAL,
	ROAD_TYPE.PATH_TOURIST,
	ROAD_TYPE.TRAIL,
	ROAD_TYPE.MINOR,
	ROAD_TYPE.MAIN,
	ROAD_TYPE.RUNWAY,
	ROAD_TYPE.BRIDGE,
];
const PATHS: ReadonlySet<number> = new Set([ROAD_TYPE.PATH_TOURIST, ROAD_TYPE.PATH_GENERAL]);

// The game shows footpaths and building footprints only when zoomed in close.
const PATHS_FROM_SCALE = 1.5;
const BUILDINGS_FROM_SCALE = 0.25;
const COARSE_BELOW_SCALE = 0.5;

function shape(kind: number, points: number[]): Shape {
	let minX = Infinity;
	let minZ = Infinity;
	let maxX = -Infinity;
	let maxZ = -Infinity;
	for (let i = 0; i < points.length; i += 2) {
		if (points[i] < minX) minX = points[i];
		if (points[i] > maxX) maxX = points[i];
		if (points[i + 1] < minZ) minZ = points[i + 1];
		if (points[i + 1] > maxZ) maxZ = points[i + 1];
	}
	return { kind, points, minX, minZ, maxX, maxZ };
}

function sortedRoads(layers: TopoLayers): Shape[] {
	const rank = (kind: number) => {
		const index = ROAD_ORDER.indexOf(kind as (typeof ROAD_ORDER)[number]);
		return index < 0 ? ROAD_ORDER.length : index;
	};
	return layers.roads.map((road) => shape(road.kind, road.points)).sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function prepareTopo(fine: TopoLayers, coarse: TopoLayers): PreparedTopo {
	return {
		forests: fine.areas.map((area) => shape(area.kind, area.points)),
		water: fine.water.map((points) => shape(0, points)),
		roads: sortedRoads(fine),
		buildings: fine.buildings.map((points) => shape(0, points)),
		coarseWater: coarse.water.map((points) => shape(0, points)),
		coarseRoads: sortedRoads(coarse),
	};
}

function visible(s: Shape, view: ViewRect): boolean {
	return s.maxX >= view.left && s.minX <= view.right && s.maxZ >= view.bottom && s.minZ <= view.top;
}

function trace(ctx: CanvasRenderingContext2D, points: number[], sx: (x: number) => number, sy: (z: number) => number) {
	ctx.beginPath();
	ctx.moveTo(sx(points[0]), sy(points[1]));
	for (let i = 2; i < points.length; i += 2) ctx.lineTo(sx(points[i]), sy(points[i + 1]));
	ctx.closePath();
}

export function drawTopo(
	ctx: CanvasRenderingContext2D,
	topo: PreparedTopo,
	sx: (x: number) => number,
	sy: (z: number) => number,
	scale: number,
	view: ViewRect
): void {
	const coarse = scale < COARSE_BELOW_SCALE;

	ctx.fillStyle = FOREST;
	for (const s of topo.forests) {
		if (!visible(s, view)) continue;
		trace(ctx, s.points, sx, sy);
		ctx.fill();
	}

	ctx.fillStyle = WATER;
	for (const s of coarse ? topo.coarseWater : topo.water) {
		if (!visible(s, view)) continue;
		trace(ctx, s.points, sx, sy);
		ctx.fill();
	}

	for (const s of coarse ? topo.coarseRoads : topo.roads) {
		if ((PATHS.has(s.kind) && scale < PATHS_FROM_SCALE) || !visible(s, view)) continue;
		trace(ctx, s.points, sx, sy);
		ctx.fillStyle = ROAD_COLOURS[s.kind] ?? ROAD_COLOURS[ROAD_TYPE.MINOR];
		ctx.fill();
		// A bridge deck is one quad, safe to stroke; the game marks its sides in black.
		if (s.kind === ROAD_TYPE.BRIDGE) {
			ctx.strokeStyle = '#1d232b';
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	}

	if (scale < BUILDINGS_FROM_SCALE) return;
	ctx.fillStyle = BUILDING_FILL;
	ctx.strokeStyle = BUILDING_LINE;
	ctx.lineWidth = 1;
	for (const s of topo.buildings) {
		if (!visible(s, view)) continue;
		trace(ctx, s.points, sx, sy);
		ctx.fill();
		// Footprints are single rings, so their outline is safe to draw.
		ctx.stroke();
	}
}
