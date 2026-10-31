// Reads the map geometry Arma Reforger's Workbench writes with World Editor > Export Map Data,
// type Geometry2D (a .topo file): the vector layers the in-game map draws over its relief.
// Runs in the browser: DataView only, no Node APIs.
//
// The format is undocumented; the layouts below were recovered from exports and every section
// parser must land exactly on its section's end offset, or the section is dropped with a warning.
//
//   file     'TOPO', u32 version (1), u32 payloadSize, u32 end, u32 0, sections up to end, '_EOF'
//   section  char[4] tag, u32 version, u32 payloadSize, u32 end (absolute), u32 0, payload
//
// Points are flat [x, y] float pairs in the game's map space, the frame SCR_MapEntity draws in:
// x is world x (east) and y = terrainSizeZ - world z, so y grows southwards. The terrain size is
// not stored; inferTerrainSize() recovers it from the building anchors, the one record kind that
// keeps world z. toLayers() converts everything to world x,z.

export class TopoFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TopoFormatError';
	}
}

/** Engine enum RoadType; the ROAD header counts records per value. */
export const ROAD_TYPE = {
	RUNWAY: 0,
	MAIN: 1,
	MINOR: 2,
	TRAIL: 3,
	PATH_TOURIST: 4,
	PATH_GENERAL: 5,
	BRIDGE: 6,
	NOT_A_ROAD: 7,
} as const;

/** Engine enum EMapPowerlineType. */
export const POWER_LINE_TYPE = { VERY_HIGH_VOLTAGE: 0, HIGH_VOLTAGE: 1, LOW_VOLTAGE: 2 } as const;

/** Engine enum EMapBuildingType; BULD stores one group per value plus a fifth, unnamed group. */
export const BUILDING_TYPE = { BUILDING: 0, CASTLE_BUILDING: 1, CASTLE_WALL: 2, WALL: 3 } as const;

/** Engine enum EMapAreaType. */
export const AREA_TYPE = { TREE: 0, OTHER: 1 } as const;

/**
 * Bits of a WATR record's type. LAKE set: a lake polygon, triangulated; clear: a spline river,
 * triangulated as a strip. UNKNOWN is not understood: every body in one sample carries it, and in
 * the other some lakes gain it in coarser LODs. The game draws every type in the same colour.
 */
export const WATER_TYPE_BITS = { LAKE: 1, UNKNOWN: 2 } as const;

/** Flat [x0, y0, x1, y1, ...] in map space. */
export type MapPoints = Float32Array;

export type TopoSection = {
	tag: string;
	version: number;
	/** Offset of the section header. */
	offset: number;
	/** Offset just past the payload. */
	end: number;
	parsed: boolean;
};

export type TopoRoad = {
	/** ROAD_TYPE value. */
	type: number;
	/**
	 * Road surface as quads, 4 points each (a, b, c, d): a-b crosses the road at the start, d-c at
	 * the end. A quad normally starts on the previous quad's far edge (a = previous d, b = previous c).
	 */
	quads: MapPoints;
	/** Point index (a multiple of 4) of every quad that is a bridge span; the map draws a bridge symbol there. */
	bridges: number[];
};

export type TopoRoads = {
	/** Record count per ROAD_TYPE value; every LOD holds the same records. */
	typeCounts: number[];
	/** LOD 0 is the full detail; later LODs simplify the same records. */
	lods: TopoRoad[][];
};

export type TopoPowerLine = {
	/** POWER_LINE_TYPE value. */
	type: number;
	/** Open polyline through the pylons. */
	points: MapPoints;
};

export type TopoBuildingAnchor = {
	/** Unknown u32; 0 in every sample. */
	unknown: number;
	/** World x of the footprint's centre. */
	x: number;
	/** World z (not map y) of the footprint's centre. */
	z: number;
	/**
	 * In world x,z; for ~95% of anchors it points from the footprint's second corner to its first.
	 * Usually unit length; other lengths presumably come from the owning entity's scale or tilt.
	 */
	dirX: number;
	dirZ: number;
};

export type TopoBuildingGroup = {
	/** BUILDING_TYPE value, or 4 for the unnamed fifth group. */
	type: number;
	/** Closed rings, normally 4-point rectangles. */
	footprints: MapPoints[];
	/**
	 * At most one per footprint, in footprint order, but only for some footprints; which ones get
	 * an anchor is not understood. An anchor's footprint is only known by position.
	 */
	anchors: TopoBuildingAnchor[];
};

export type TopoAreas = {
	/** Record count per LOD for AREA_TYPE.TREE polygons (forest areas); stops at the first non-empty LOD. */
	treeAreaCounts: number[];
	/** Record count per LOD for AREA_TYPE.OTHER polygons; stops at the first non-empty LOD. */
	otherAreaCounts: number[];
	/**
	 * False when area records were present: their layout is unknown because every export seen so
	 * far was made with "Ignore Generator entities" on and left both lists empty.
	 */
	areasParsed: boolean;
	/** Individual tree positions, the input the map uses for its forest areas. */
	trees: MapPoints;
};

export type TopoWaterBody = {
	/** WATER_TYPE_BITS combination. */
	type: number;
	/** Unknown u8; 0 in every sample. */
	flag: number;
	/** Triangle list: every 3 points form a triangle; winding is not consistent. */
	triangles: MapPoints;
	/** Index buffer into `triangles`; 0..n-1 in every sample. */
	indices: Uint32Array;
};

export type TopoHill = {
	/** Summit elevation in metres; only hills above the exporter's "Minimum hill height" are written. */
	elevation: number;
	x: number;
	y: number;
	/** Unknown u32 fields before and after the floats; 0 in every sample. */
	unknown: [number, number, number];
};

export type TopoMap = {
	version: number;
	sections: TopoSection[];
	roads: TopoRoads | null;
	/** Per LOD. */
	powerLines: TopoPowerLine[][] | null;
	buildings: TopoBuildingGroup[] | null;
	areas: TopoAreas | null;
	/** Per LOD. */
	water: TopoWaterBody[][] | null;
	hills: TopoHill[] | null;
	warnings: string[];
};

class Reader {
	private readonly view: DataView;
	private pos: number;
	readonly end: number;

	constructor(view: DataView, start: number, end: number) {
		this.view = view;
		this.pos = start;
		this.end = end;
	}

	get offset(): number {
		return this.pos;
	}

	private take(bytes: number): number {
		const at = this.pos;
		if (at + bytes > this.end) throw new TopoFormatError(`read of ${bytes} bytes at ${at} runs past ${this.end}`);
		this.pos = at + bytes;
		return at;
	}

	u8(): number {
		return this.view.getUint8(this.take(1));
	}

	u32(): number {
		return this.view.getUint32(this.take(4), true);
	}

	f32(): number {
		return this.view.getFloat32(this.take(4), true);
	}

	/** A count followed by items of at least `itemBytes` each. */
	count(itemBytes: number): number {
		const n = this.u32();
		// A corrupt count must fail here instead of allocating gigabytes.
		if (n * itemBytes > this.end - this.pos) throw new TopoFormatError(`count ${n} at ${this.pos - 4} does not fit the section`);
		return n;
	}

	points(n: number): MapPoints {
		const at = this.take(n * 8);
		const out = new Float32Array(n * 2);
		for (let i = 0; i < out.length; i++) out[i] = this.view.getFloat32(at + i * 4, true);
		return out;
	}

	skipToEnd(): void {
		this.pos = this.end;
	}

	u32s(n: number): Uint32Array {
		const at = this.take(n * 4);
		const out = new Uint32Array(n);
		for (let i = 0; i < n; i++) out[i] = this.view.getUint32(at + i * 4, true);
		return out;
	}
}

// ROAD v2: u32 typeCounts[8], u32 lodCount, per LOD: u32 count,
// per record: u8 type, u32 n, n points, u32 bridgeCount, bridgeCount * u32 point index.
function parseRoads(r: Reader, map: TopoMap): void {
	const typeCounts: number[] = [];
	for (let i = 0; i < 8; i++) typeCounts.push(r.u32());
	const lodCount = r.count(4);
	const lods: TopoRoad[][] = [];
	for (let l = 0; l < lodCount; l++) {
		const count = r.count(9);
		const roads: TopoRoad[] = [];
		for (let i = 0; i < count; i++) {
			const type = r.u8();
			const quads = r.points(r.count(8));
			const bridges = Array.from(r.u32s(r.count(4)));
			roads.push({ type, quads, bridges });
		}
		lods.push(roads);
	}
	map.roads = { typeCounts, lods };
	const odd = lods.flat().filter((road) => road.quads.length % 8 !== 0).length;
	if (odd) map.warnings.push(`ROAD: ${odd} records do not hold whole quads`);
}

// PWLN v1: u32 lodCount, per LOD: u32 count, per record: u32 type, u32 n, n points.
function parsePowerLines(r: Reader, map: TopoMap): void {
	const lodCount = r.count(4);
	const lods: TopoPowerLine[][] = [];
	for (let l = 0; l < lodCount; l++) {
		const count = r.count(8);
		const lines: TopoPowerLine[] = [];
		for (let i = 0; i < count; i++) {
			const type = r.u32();
			lines.push({ type, points: r.points(r.count(8)) });
		}
		lods.push(lines);
	}
	map.powerLines = lods;
}

// BULD v1: u32 groupCount, per group: u32 footprintCount, per footprint: u32 n, n points;
// then u32 anchorCount, per anchor: u32 unknown, f32 x, f32 z, f32 dirX, f32 dirZ.
function parseBuildings(r: Reader, map: TopoMap): void {
	const groupCount = r.count(8);
	const groups: TopoBuildingGroup[] = [];
	for (let type = 0; type < groupCount; type++) {
		const footprintCount = r.count(4);
		const footprints: MapPoints[] = [];
		for (let i = 0; i < footprintCount; i++) footprints.push(r.points(r.count(8)));
		const anchorCount = r.count(20);
		const anchors: TopoBuildingAnchor[] = [];
		for (let i = 0; i < anchorCount; i++) {
			anchors.push({ unknown: r.u32(), x: r.f32(), z: r.f32(), dirX: r.f32(), dirZ: r.f32() });
		}
		groups.push({ type, footprints, anchors });
	}
	map.buildings = groups;
}

// AREA v1: for TREE then OTHER: u32 lodCount, per LOD: u32 count (+ records, layout unknown);
// then u32 treeCount, treeCount points.
function parseAreas(r: Reader, map: TopoMap, view: DataView, sectionStart: number): void {
	const counts: number[][] = [];
	let areasParsed = true;
	for (let list = 0; list < 2 && areasParsed; list++) {
		const lodCount = r.count(4);
		const perLod: number[] = [];
		for (let l = 0; l < lodCount; l++) {
			const count = r.u32();
			perLod.push(count);
			if (count > 0) {
				areasParsed = false;
				break;
			}
		}
		counts.push(perLod);
	}
	let trees: MapPoints;
	if (areasParsed) {
		trees = r.points(r.count(8));
	} else {
		// The tree list ends the section, so its start can be found from the end: the only u32
		// that equals the number of 8-byte pairs after it. Pair floats are map coordinates whose
		// bit patterns are far larger than any plausible count.
		const end = r.end;
		let found = -1;
		for (let n = 0; end - 4 - n * 8 >= sectionStart; n++) {
			if (view.getUint32(end - 4 - n * 8, true) === n) {
				found = n;
				break;
			}
		}
		if (found < 0) throw new TopoFormatError('AREA: area records present and the tree list could not be located');
		map.warnings.push('AREA: area polygons present in an unknown layout; only the trees were read');
		const tail = new Reader(view, end - 4 - found * 8, end);
		trees = tail.points(tail.count(8));
		r.skipToEnd();
	}
	map.areas = { treeAreaCounts: counts[0] ?? [], otherAreaCounts: counts[1] ?? [], areasParsed, trees };
}

// WATR v1: u32 lodCount, per LOD: u32 count, per record: u32 type, u8 flag, u32 n, n points,
// u32 indexCount, indexCount * u32.
function parseWater(r: Reader, map: TopoMap): void {
	const lodCount = r.count(4);
	const lods: TopoWaterBody[][] = [];
	for (let l = 0; l < lodCount; l++) {
		const count = r.count(13);
		const bodies: TopoWaterBody[] = [];
		for (let i = 0; i < count; i++) {
			const type = r.u32();
			const flag = r.u8();
			const triangles = r.points(r.count(8));
			const indices = r.u32s(r.count(4));
			bodies.push({ type, flag, triangles, indices });
		}
		lods.push(bodies);
	}
	map.water = lods;
}

// HILL v0: u32 count, per record: u32 ?, f32 elevation, f32 x, f32 y, u32 ?, u32 ?.
function parseHills(r: Reader, map: TopoMap): void {
	const count = r.count(24);
	const hills: TopoHill[] = [];
	for (let i = 0; i < count; i++) {
		const a = r.u32();
		const elevation = r.f32();
		const x = r.f32();
		const y = r.f32();
		hills.push({ elevation, x, y, unknown: [a, r.u32(), r.u32()] });
	}
	map.hills = hills;
}

const SECTIONS: Record<string, { version: number; parse: (r: Reader, map: TopoMap, view: DataView, start: number) => void }> = {
	ROAD: { version: 2, parse: parseRoads },
	PWLN: { version: 1, parse: parsePowerLines },
	BULD: { version: 1, parse: parseBuildings },
	AREA: { version: 1, parse: parseAreas },
	WATR: { version: 1, parse: parseWater },
	HILL: { version: 0, parse: parseHills },
};

function tag(view: DataView, at: number): string {
	let s = '';
	for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(at + i));
	return s;
}

export function parseTopo(data: ArrayBuffer): TopoMap {
	const view = new DataView(data);
	if (view.byteLength < 20 || tag(view, 0) !== 'TOPO') throw new TopoFormatError('not a .topo file (missing TOPO magic)');
	const version = view.getUint32(4, true);
	if (version !== 1) throw new TopoFormatError(`unsupported .topo version ${version}`);

	const map: TopoMap = {
		version,
		sections: [],
		roads: null,
		powerLines: null,
		buildings: null,
		areas: null,
		water: null,
		hills: null,
		warnings: [],
	};

	let fileEnd = view.getUint32(12, true);
	if (fileEnd > view.byteLength) {
		map.warnings.push(`file truncated: header promises ${fileEnd} bytes, got ${view.byteLength}`);
		fileEnd = view.byteLength;
	} else if (fileEnd + 4 > view.byteLength || tag(view, fileEnd) !== '_EOF') {
		map.warnings.push('missing _EOF trailer');
	}

	let at = 20;
	while (at + 20 <= fileEnd) {
		const name = tag(view, at);
		const sectionVersion = view.getUint32(at + 4, true);
		const payload = view.getUint32(at + 8, true);
		const end = view.getUint32(at + 12, true);
		if (end !== at + 20 + payload || end > fileEnd) {
			map.warnings.push(`section ${JSON.stringify(name)} at ${at} has an inconsistent size; stopped reading`);
			break;
		}
		const section: TopoSection = { tag: name, version: sectionVersion, offset: at, end, parsed: false };
		map.sections.push(section);
		const known = SECTIONS[name];
		if (!known) {
			map.warnings.push(`unknown section ${JSON.stringify(name)} skipped`);
		} else if (known.version !== sectionVersion) {
			map.warnings.push(`${name} version ${sectionVersion} is not supported (expected ${known.version}); skipped`);
		} else {
			const reader = new Reader(view, at + 20, end);
			try {
				known.parse(reader, map, view, at + 20);
				if (reader.offset !== end) throw new TopoFormatError(`stopped at ${reader.offset}, section ends at ${end}`);
				section.parsed = true;
			} catch (error) {
				if (!(error instanceof TopoFormatError)) throw error;
				map.warnings.push(`${name}: ${error.message}; skipped`);
				clearLayer(map, name);
			}
		}
		at = end;
	}
	return map;
}

function clearLayer(map: TopoMap, name: string): void {
	if (name === 'ROAD') map.roads = null;
	else if (name === 'PWLN') map.powerLines = null;
	else if (name === 'BULD') map.buildings = null;
	else if (name === 'AREA') map.areas = null;
	else if (name === 'WATR') map.water = null;
	else if (name === 'HILL') map.hills = null;
}

/**
 * The terrain's z size, which converts map y back to world z. Anchors hold world z while their
 * footprints hold map y, so every anchor/footprint pair sums to it. Null when nothing pairs up.
 */
export function inferTerrainSize(map: TopoMap): number | null {
	const votes = new Map<number, number>();
	let total = 0;
	for (const group of map.buildings ?? []) {
		if (!group.anchors.length) continue;
		const byX = new Map<number, number[]>();
		for (const ring of group.footprints) {
			const n = ring.length / 2;
			let cx = 0;
			let cy = 0;
			for (let i = 0; i < ring.length; i += 2) {
				cx += ring[i];
				cy += ring[i + 1];
			}
			const key = Math.round((cx / n) * 10);
			const list = byX.get(key);
			if (list) list.push(cx / n, cy / n);
			else byX.set(key, [cx / n, cy / n]);
		}
		for (const anchor of group.anchors) {
			const key = Math.round(anchor.x * 10);
			for (let k = key - 1; k <= key + 1; k++) {
				const list = byX.get(k);
				if (!list) continue;
				for (let i = 0; i < list.length; i += 2) {
					if (Math.abs(list[i] - anchor.x) > 0.01) continue;
					const size = Math.round(list[i + 1] + anchor.z);
					votes.set(size, (votes.get(size) ?? 0) + 1);
					total++;
				}
			}
		}
	}
	let best: number | null = null;
	let bestVotes = 0;
	for (const [size, n] of votes) {
		if (n > bestVotes) {
			best = size;
			bestVotes = n;
		}
	}
	// Footprints that merely share an anchor's x vote at random; a real size wins outright.
	return best !== null && bestVotes * 2 > total ? best : null;
}

// ---------------------------------------------------------------------------------------------
// Layers for the replay viewer's canvas: flat x,z lists in world metres, each filled as one path.

export type TopoLayers = {
	areas: { kind: number; points: number[] }[];
	water: number[][];
	roads: { kind: number; points: number[] }[];
	buildings: number[][];
};

export type ForestOptions = {
	/** Grid cell in metres. */
	cell: number;
	/** Half-width in metres of the square the tree density is averaged over. */
	radius: number;
	/** Trees per 1000 m² at which ground counts as forest. */
	density: number;
	/** Forest patches smaller than this many m² are dropped. */
	minArea: number;
	/** Clearings smaller than this many m² are filled. */
	minHole: number;
	/** Douglas-Peucker tolerance in metres for the outlines. */
	simplify: number;
};

// Tuned against an in-game screenshot of Arland: 0.78 intersection-over-union with its forest
// areas. Those have the straight edges of drawn polygons, so tree density cannot match them exactly.
export const DEFAULT_FOREST: ForestOptions = { cell: 4, radius: 12, density: 14, minArea: 2500, minHole: 5000, simplify: 2 };

const MAX_FOREST_GRID = 1536;

export type LayerOptions = {
	/** Terrain z size in metres; defaults to inferTerrainSize(), then to the next power of two above the geometry. */
	terrainSize?: number;
	/** Detail level, 0 = full. */
	lod?: number;
	forest?: Partial<ForestOptions>;
};

/** Road types the in-game map never draws. */
const HIDDEN_ROADS: ReadonlySet<number> = new Set([ROAD_TYPE.NOT_A_ROAD]);
/** Building groups the in-game map never draws (view layer 0 in the game's map config). */
const HIDDEN_BUILDINGS: ReadonlySet<number> = new Set([BUILDING_TYPE.CASTLE_WALL, BUILDING_TYPE.WALL, 4]);

export function toLayers(map: TopoMap, options: LayerOptions = {}): TopoLayers {
	const size = options.terrainSize ?? inferTerrainSize(map) ?? fallbackSize(map);
	const lod = options.lod ?? 0;
	const forest: ForestOptions = { ...DEFAULT_FOREST, ...options.forest };
	const toWorld = (ring: ArrayLike<number>): number[] => {
		const out = new Array<number>(ring.length);
		for (let i = 0; i < ring.length; i += 2) {
			out[i] = ring[i];
			out[i + 1] = size - ring[i + 1];
		}
		return out;
	};

	const roads: TopoLayers['roads'] = [];
	for (const road of pickLod(map.roads?.lods, lod)) {
		if (HIDDEN_ROADS.has(road.type) || road.quads.length < 8) continue;
		const quads: ArrayLike<number>[] = [];
		for (let i = 0; i + 8 <= road.quads.length; i += 8) quads.push(road.quads.subarray(i, i + 8));
		const points = joinRings(outline(quads));
		if (points.length >= 6) roads.push({ kind: road.type, points: toWorld(points) });
		// Bridge decks come out again under their own kind so they can be drawn on top.
		for (const index of road.bridges) {
			if (index * 2 + 8 <= road.quads.length) roads.push({ kind: ROAD_TYPE.BRIDGE, points: toWorld(road.quads.subarray(index * 2, index * 2 + 8)) });
		}
	}

	const water: number[][] = [];
	for (const body of pickLod(map.water, lod)) {
		const triangles: ArrayLike<number>[] = [];
		for (let i = 0; i + 6 <= body.triangles.length; i += 6) triangles.push(body.triangles.subarray(i, i + 6));
		const points = joinRings(outline(triangles));
		if (points.length >= 6) water.push(toWorld(points));
	}

	const buildings: number[][] = [];
	for (const group of map.buildings ?? []) {
		if (HIDDEN_BUILDINGS.has(group.type)) continue;
		for (const ring of group.footprints) if (ring.length >= 6) buildings.push(toWorld(ring));
	}

	const areas: TopoLayers['areas'] = [];
	if (map.areas && map.areas.trees.length) {
		for (const polygon of forestPolygons(map.areas.trees, size, forest)) areas.push({ kind: AREA_TYPE.TREE, points: toWorld(polygon) });
	}

	return { areas, water, roads, buildings };
}

function pickLod<T>(lods: T[][] | null | undefined, lod: number): T[] {
	if (!lods || !lods.length) return [];
	return lods[Math.min(Math.max(0, lod), lods.length - 1)];
}

function fallbackSize(map: TopoMap): number {
	let max = 0;
	const scan = (points: ArrayLike<number>) => {
		for (let i = 0; i < points.length; i++) if (points[i] > max) max = points[i];
	};
	for (const road of pickLod(map.roads?.lods, 0)) scan(road.quads);
	for (const group of map.buildings ?? []) for (const ring of group.footprints) scan(ring);
	if (map.areas) scan(map.areas.trees);
	for (const body of pickLod(map.water, 0)) scan(body.triangles);
	let size = 1024;
	while (size < max) size *= 2;
	return size;
}

function signedArea(ring: ArrayLike<number>): number {
	let sum = 0;
	const n = ring.length;
	for (let i = 0; i < n; i += 2) {
		const j = (i + 2) % n;
		sum += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
	}
	return sum / 2;
}

/**
 * Outline of a union of polygons (quads, triangles) that share exact vertices. Once every polygon
 * winds the same way, an edge shared by two of them appears once in each direction and cancels;
 * the edges left over are the outline, holes included and wound the other way.
 */
function outline(polygons: ArrayLike<number>[]): number[][] {
	const ids = new Map<string, number>();
	const coords: number[] = [];
	const vertex = (x: number, y: number): number => {
		const key = `${x},${y}`;
		let id = ids.get(key);
		if (id === undefined) {
			id = coords.length / 2;
			ids.set(key, id);
			coords.push(x, y);
		}
		return id;
	};
	// Directed edge from a to b, keyed a * 2^26 + b; vertex counts stay far below 2^26.
	const edges = new Map<number, number>();
	const SHIFT = 67108864;
	for (const polygon of polygons) {
		const area = signedArea(polygon);
		if (!(Math.abs(area) > 1e-6)) continue;
		const n = polygon.length / 2;
		const ring: number[] = [];
		for (let k = 0; k < n; k++) {
			const i = area > 0 ? k : n - 1 - k;
			const id = vertex(polygon[i * 2], polygon[i * 2 + 1]);
			if (ring[ring.length - 1] !== id) ring.push(id);
		}
		if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
		for (let k = 0; k < ring.length; k++) {
			const a = ring[k];
			const b = ring[(k + 1) % ring.length];
			const back = b * SHIFT + a;
			const reverse = edges.get(back);
			if (reverse) {
				if (reverse === 1) edges.delete(back);
				else edges.set(back, reverse - 1);
			} else {
				const key = a * SHIFT + b;
				edges.set(key, (edges.get(key) ?? 0) + 1);
			}
		}
	}
	const outgoing = new Map<number, number[]>();
	for (const [key, n] of edges) {
		const a = Math.floor(key / SHIFT);
		const b = key - a * SHIFT;
		let list = outgoing.get(a);
		if (!list) outgoing.set(a, (list = []));
		for (let k = 0; k < n; k++) list.push(b);
	}
	const rings: number[][] = [];
	for (const [start, list] of outgoing) {
		while (list.length) {
			const ring: number[] = [];
			let at = start;
			// Every vertex has as many edges in as out, so a walk from start can only end at start.
			for (;;) {
				const next = outgoing.get(at)?.pop();
				if (next === undefined) break;
				ring.push(coords[at * 2], coords[at * 2 + 1]);
				at = next;
				if (at === start) break;
			}
			if (ring.length >= 6) rings.push(ring);
		}
	}
	return rings;
}

/**
 * Joins rings into one closed path. Each extra ring hangs off the first ring's start by a spoke
 * walked out and back; the two directions cancel under the canvas's nonzero fill, so holes stay
 * open and no seam is drawn where the pieces meet.
 */
function joinRings(rings: number[][]): number[] {
	if (!rings.length) return [];
	const first = rings[0];
	const out = first.slice();
	for (let r = 1; r < rings.length; r++) {
		const ring = rings[r];
		out.push(first[0], first[1]);
		for (let i = 0; i < ring.length; i++) out.push(ring[i]);
		out.push(ring[0], ring[1], first[0], first[1]);
	}
	return out;
}

/**
 * Forest areas the way the map shows them: the export carries no forest polygons (Workbench skips
 * forest generators by default), only trees, so ground with enough trees per area becomes forest.
 * Returns polygons in map space, each an outer ring with its clearings joined in.
 */
export function forestPolygons(trees: MapPoints, size: number, options: ForestOptions = DEFAULT_FOREST): number[][] {
	// The grid is capped so a large terrain stays within a few tens of MB of typed arrays.
	const cell = Math.max(options.cell, size / MAX_FOREST_GRID);
	const n = Math.ceil(size / cell);

	// Box-averaged density via a summed-area table, built in place over the per-cell counts.
	const w = n + 1;
	const sat = new Int32Array(w * w);
	for (let i = 0; i < trees.length; i += 2) {
		const cx = Math.floor(trees[i] / cell);
		const cy = Math.floor(trees[i + 1] / cell);
		if (cx >= 0 && cy >= 0 && cx < n && cy < n) sat[(cy + 1) * w + cx + 1]++;
	}
	for (let y = 1; y < w; y++) {
		let row = 0;
		for (let x = 1; x < w; x++) {
			row += sat[y * w + x];
			sat[y * w + x] = sat[(y - 1) * w + x] + row;
		}
	}
	const r = Math.max(1, Math.round(options.radius / cell));
	const boxArea = Math.pow((2 * r + 1) * cell, 2);
	const threshold = (options.density / 1000) * boxArea;
	const mask = new Uint8Array(n * n);
	for (let y = 0; y < n; y++) {
		const y0 = Math.max(0, y - r);
		const y1 = Math.min(n, y + r + 1);
		for (let x = 0; x < n; x++) {
			const x0 = Math.max(0, x - r);
			const x1 = Math.min(n, x + r + 1);
			const sum = sat[y1 * w + x1] - sat[y0 * w + x1] - sat[y1 * w + x0] + sat[y0 * w + x0];
			mask[y * n + x] = sum >= threshold ? 1 : 0;
		}
	}

	const cellArea = cell * cell;
	const scratch = { stack: new Int32Array(n * n), members: new Int32Array(n * n) };
	// Forest connects diagonally and clearings do not, matching how the contour tracer below
	// resolves saddles; otherwise a dropped patch could leave a dangling outline.
	removeComponents(mask, n, 1, true, scratch, (cells) => cells * cellArea < options.minArea);
	removeComponents(mask, n, 0, false, scratch, (cells, touchesEdge) => !touchesEdge && cells * cellArea < options.minHole);

	const rings = traceContours(mask, n, cell).map((ring) => simplifyRing(ring, options.simplify)).filter((ring) => ring.length >= 6);
	return assemblePolygons(rings);
}

/** Flips every component of `value` cells for which `drop` says so. */
function removeComponents(
	mask: Uint8Array,
	n: number,
	value: number,
	diagonal: boolean,
	scratch: { stack: Int32Array; members: Int32Array },
	drop: (cells: number, touchesEdge: boolean) => boolean
): void {
	const seen = new Uint8Array(n * n);
	const { stack, members } = scratch;
	for (let s = 0; s < n * n; s++) {
		if (mask[s] !== value || seen[s]) continue;
		let top = 0;
		let size = 0;
		let touchesEdge = false;
		stack[top++] = s;
		seen[s] = 1;
		while (top) {
			const c = stack[--top];
			members[size++] = c;
			const x = c % n;
			const y = (c - x) / n;
			if (x === 0 || y === 0 || x === n - 1 || y === n - 1) touchesEdge = true;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
					const m = ny * n + nx;
					if (mask[m] === value && !seen[m]) {
						seen[m] = 1;
						stack[top++] = m;
					}
				}
			}
		}
		if (drop(size, touchesEdge)) for (let k = 0; k < size; k++) mask[members[k]] = value ? 0 : 1;
	}
}

/**
 * Marching squares over the cell centres of a 0/1 grid, cutting square edges at their midpoints.
 * Rings run counter-clockwise around forest as seen with y pointing down, so in map coordinates
 * outer rings have negative signed area and clearings positive. Saddles join the forest diagonally.
 */
function traceContours(mask: Uint8Array, n: number, cell: number): number[][] {
	// Sample grid padded by one empty cell all round so every contour closes.
	const m = n + 2;
	const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= n || y >= n ? 0 : mask[y * n + x]);
	// Edge ids: 2 * sample index for the edge to the right neighbour, +1 for the one below.
	const next = new Int32Array(2 * m * m).fill(-1);
	const id = (x: number, y: number, down: number): number => 2 * ((y + 1) * m + (x + 1)) + down;
	const link = (from: number, to: number): void => {
		next[from] = to;
	};
	for (let y = -1; y < n; y++) {
		for (let x = -1; x < n; x++) {
			const tl = at(x, y);
			const tr = at(x + 1, y);
			const br = at(x + 1, y + 1);
			const bl = at(x, y + 1);
			const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
			if (code === 0 || code === 15) continue;
			const top = id(x, y, 0);
			const bottom = id(x, y + 1, 0);
			const left = id(x, y, 1);
			const right = id(x + 1, y, 1);
			switch (code) {
				case 1: link(bottom, left); break;
				case 2: link(right, bottom); break;
				case 3: link(right, left); break;
				case 4: link(top, right); break;
				case 5: link(top, left); link(bottom, right); break;
				case 6: link(top, bottom); break;
				case 7: link(top, left); break;
				case 8: link(left, top); break;
				case 9: link(bottom, top); break;
				case 10: link(left, bottom); link(right, top); break;
				case 11: link(right, top); break;
				case 12: link(left, right); break;
				case 13: link(bottom, right); break;
				case 14: link(left, bottom); break;
			}
		}
	}
	const point = (e: number, out: number[]): void => {
		const down = e & 1;
		const s = e >> 1;
		const sx = (s % m) - 1;
		const sy = Math.floor(s / m) - 1;
		// Samples sit at cell centres; an edge's midpoint is half a cell further along it.
		out.push((sx + 0.5 + (down ? 0 : 0.5)) * cell, (sy + 0.5 + (down ? 0.5 : 0)) * cell);
	};
	const rings: number[][] = [];
	for (let e = 0; e < next.length; e++) {
		if (next[e] < 0) continue;
		const ring: number[] = [];
		let c = e;
		while (next[c] >= 0) {
			point(c, ring);
			const to = next[c];
			next[c] = -1;
			c = to;
		}
		rings.push(ring);
	}
	return rings;
}

/** Douglas-Peucker on a closed ring, anchored at its first point and the point farthest from it. */
function simplifyRing(ring: number[], tolerance: number): number[] {
	const n = ring.length / 2;
	if (n <= 4 || tolerance <= 0) return ring;
	let far = 0;
	let best = -1;
	for (let i = 1; i < n; i++) {
		const d = (ring[i * 2] - ring[0]) ** 2 + (ring[i * 2 + 1] - ring[1]) ** 2;
		if (d > best) {
			best = d;
			far = i;
		}
	}
	const keep = new Uint8Array(n + 1);
	keep[0] = keep[far] = keep[n] = 1;
	const px = (i: number) => ring[(i % n) * 2];
	const py = (i: number) => ring[(i % n) * 2 + 1];
	const tol2 = tolerance * tolerance;
	const stack: number[] = [0, far, far, n];
	while (stack.length) {
		const b = stack.pop() as number;
		const a = stack.pop() as number;
		const ax = px(a);
		const ay = py(a);
		const dx = px(b) - ax;
		const dy = py(b) - ay;
		const len2 = dx * dx + dy * dy;
		let worst = -1;
		let worstD = tol2;
		for (let i = a + 1; i < b; i++) {
			const ex = px(i) - ax;
			const ey = py(i) - ay;
			const cross = ex * dy - ey * dx;
			const d = len2 > 0 ? (cross * cross) / len2 : ex * ex + ey * ey;
			if (d > worstD) {
				worstD = d;
				worst = i;
			}
		}
		if (worst >= 0) {
			keep[worst] = 1;
			stack.push(a, worst, worst, b);
		}
	}
	const out: number[] = [];
	for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i * 2], ring[i * 2 + 1]);
	return out;
}

/** Groups clearings (positive rings) under the smallest outer ring (negative) that contains them. */
function assemblePolygons(rings: number[][]): number[][] {
	type Outer = { ring: number[]; area: number; box: [number, number, number, number]; holes: number[][] };
	const box = (ring: number[]): [number, number, number, number] => {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (let i = 0; i < ring.length; i += 2) {
			if (ring[i] < x0) x0 = ring[i];
			if (ring[i] > x1) x1 = ring[i];
			if (ring[i + 1] < y0) y0 = ring[i + 1];
			if (ring[i + 1] > y1) y1 = ring[i + 1];
		}
		return [x0, y0, x1, y1];
	};
	const outers: Outer[] = [];
	const holes: number[][] = [];
	for (const ring of rings) {
		const area = signedArea(ring);
		if (area < 0) outers.push({ ring, area: -area, box: box(ring), holes: [] });
		else if (area > 0) holes.push(ring);
	}
	outers.sort((a, b) => a.area - b.area);
	for (const hole of holes) {
		const x = hole[0];
		const y = hole[1];
		const owner = outers.find((o) => x >= o.box[0] && x <= o.box[2] && y >= o.box[1] && y <= o.box[3] && contains(o.ring, x, y));
		owner?.holes.push(hole);
	}
	return outers.map((o) => joinRings([o.ring, ...o.holes]));
}

function contains(ring: number[], x: number, y: number): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const yi = ring[i + 1];
		const yj = ring[j + 1];
		if (yi > y !== yj > y && x < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) inside = !inside;
	}
	return inside;
}
