// Draws a terrain's exported map geometry over its relief. The layers arrive as flat
// x,z coordinate lists in world metres.

export type TopoLayers = {
	areas: { kind: number; points: number[] }[];
	water: number[][];
	roads: { kind: number; points: number[] }[];
	buildings: number[][];
};

const FOREST = 'rgba(126,178,104,0.55)';
const WATER = 'rgba(132,201,226,0.9)';
const ROAD = 'rgba(214,186,126,0.95)';
const BUILDING = 'rgba(92,98,108,0.85)';

function path(ctx: CanvasRenderingContext2D, points: number[], sx: (x: number) => number, sy: (z: number) => number) {
	ctx.beginPath();
	ctx.moveTo(sx(points[0]), sy(points[1]));
	for (let i = 2; i < points.length; i += 2) ctx.lineTo(sx(points[i]), sy(points[i + 1]));
	ctx.closePath();
}

export function drawTopo(
	ctx: CanvasRenderingContext2D,
	topo: TopoLayers,
	sx: (x: number) => number,
	sy: (z: number) => number,
	scale: number
): void {
	ctx.fillStyle = FOREST;
	for (const area of topo.areas) {
		if (area.points.length < 6) continue;
		path(ctx, area.points, sx, sy);
		ctx.fill();
	}
	ctx.fillStyle = WATER;
	for (const water of topo.water) {
		if (water.length < 6) continue;
		path(ctx, water, sx, sy);
		ctx.fill();
	}
	ctx.fillStyle = ROAD;
	for (const road of topo.roads) {
		if (road.points.length < 6) continue;
		path(ctx, road.points, sx, sy);
		ctx.fill();
	}
	// Footprints only read once they are a few pixels across.
	if (scale < 0.25) return;
	ctx.fillStyle = BUILDING;
	for (const building of topo.buildings) {
		if (building.length < 6) continue;
		path(ctx, building, sx, sy);
		ctx.fill();
	}
}
