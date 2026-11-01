import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	BUILDING_TYPE,
	ROAD_TYPE,
	TopoFormatError,
	inferTerrainSize,
	parseTopo,
	toLayers,
	type TopoMap,
} from '@/features/replays/domain/topo';

// Workbench exports (Export Map Data → Geometry2D) of Arland's LobbyDemo world and of Kunar.
// They are not in the repository; point TOPO_SAMPLE_DIR at a folder holding them to run these.
const SAMPLES = process.env.TOPO_SAMPLE_DIR ?? '';
const samplePath = (name: string) => (SAMPLES ? path.join(SAMPLES, name) : '');
const hasSample = (name: string) => SAMPLES !== '' && existsSync(samplePath(name));
const TERRAIN = 4096;

// Suites are collected even when skipped, so a missing sample reads as empty instead of throwing.
function readSample(name: string): ArrayBuffer {
	if (!hasSample(name)) return new ArrayBuffer(0);
	const buf = readFileSync(samplePath(name));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function eachPoint(points: ArrayLike<number>, visit: (x: number, y: number) => void): void {
	for (let i = 0; i < points.length; i += 2) visit(points[i], points[i + 1]);
}

function insideTerrain(points: ArrayLike<number>): boolean {
	let ok = true;
	eachPoint(points, (x, y) => {
		if (!(x >= 0 && x <= TERRAIN && y >= 0 && y <= TERRAIN)) ok = false;
	});
	return ok;
}

function contains(ring: number[], x: number, z: number): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const zi = ring[i + 1];
		const zj = ring[j + 1];
		if (zi > z !== zj > z && x < ((ring[j] - ring[i]) * (z - zi)) / (zj - zi) + ring[i]) inside = !inside;
	}
	return inside;
}

/** Facts that hold for any export, checked on both samples. */
function checkStructure(data: ArrayBuffer, map: TopoMap): void {
	const view = new DataView(data);
	expect(map.version).toBe(1);
	expect(map.warnings).toEqual([]);
	expect(map.sections.map((s) => s.tag)).toEqual(['ROAD', 'PWLN', 'BULD', 'AREA', 'WATR', 'HILL']);
	// Every section consumed exactly: a parser that stops short or overruns marks it unparsed.
	expect(map.sections.every((s) => s.parsed)).toBe(true);
	expect(map.sections[0].offset).toBe(20);
	for (let i = 1; i < map.sections.length; i++) expect(map.sections[i].offset).toBe(map.sections[i - 1].end);
	const end = view.getUint32(12, true);
	expect(map.sections[map.sections.length - 1].end).toBe(end);
	expect(view.getUint32(8, true)).toBe(end - 20);
	expect(data.byteLength).toBe(end + 4);
	expect(String.fromCharCode(...new Uint8Array(data, end, 4))).toBe('_EOF');

	const roads = map.roads!;
	expect(roads.lods).toHaveLength(6);
	for (const lod of roads.lods) {
		const perType = new Array(8).fill(0);
		for (const road of lod) {
			perType[road.type]++;
			expect(road.quads.length % 8).toBe(0);
			for (const index of road.bridges) {
				expect(index % 4).toBe(0);
				expect(index * 2 + 8).toBeLessThanOrEqual(road.quads.length);
			}
			expect(insideTerrain(road.quads)).toBe(true);
		}
		expect(perType).toEqual(roads.typeCounts);
	}

	for (const lod of map.powerLines!) for (const line of lod) expect(insideTerrain(line.points)).toBe(true);

	expect(map.buildings).toHaveLength(5);
	for (const group of map.buildings!) {
		for (const ring of group.footprints) expect(insideTerrain(ring)).toBe(true);
		// Anchors keep world z, footprints map y: each anchor sits on a footprint centre.
		const centres = group.footprints.map((ring) => {
			let x = 0;
			let y = 0;
			eachPoint(ring, (px, py) => {
				x += px;
				y += py;
			});
			return [x / (ring.length / 2), y / (ring.length / 2)];
		});
		for (const anchor of group.anchors) {
			expect(anchor.unknown).toBe(0);
			expect(centres.some(([x, y]) => Math.abs(x - anchor.x) < 1e-3 && Math.abs(y + anchor.z - TERRAIN) < 1e-3)).toBe(true);
		}
	}

	const areas = map.areas!;
	expect(areas.areasParsed).toBe(true);
	expect(areas.treeAreaCounts).toEqual([0, 0, 0, 0, 0, 0]);
	expect(areas.otherAreaCounts).toEqual([0, 0, 0, 0, 0, 0]);
	expect(insideTerrain(areas.trees)).toBe(true);

	for (const lod of map.water!) {
		for (const body of lod) {
			expect(body.flag).toBe(0);
			expect(body.triangles.length % 6).toBe(0);
			expect(Array.from(body.indices)).toEqual(Array.from({ length: body.triangles.length / 2 }, (_, i) => i));
			expect(insideTerrain(body.triangles)).toBe(true);
		}
	}

	for (const hill of map.hills!) {
		expect(hill.unknown).toEqual([0, 0, 0]);
		expect(hill.elevation).toBeGreaterThanOrEqual(50);
		expect(insideTerrain([hill.x, hill.y])).toBe(true);
	}

	expect(inferTerrainSize(map)).toBe(TERRAIN);

	const layers = toLayers(map);
	const all = [...layers.areas.map((a) => a.points), ...layers.water, ...layers.roads.map((r) => r.points), ...layers.buildings];
	for (const points of all) {
		expect(points.length % 2).toBe(0);
		expect(points.length).toBeGreaterThanOrEqual(6);
		expect(insideTerrain(points)).toBe(true);
	}
	expect(layers.roads.some((r) => r.kind === ROAD_TYPE.NOT_A_ROAD)).toBe(false);
	expect(layers.water).toHaveLength(map.water![0].length);
	expect(layers.buildings).toHaveLength(map.buildings![BUILDING_TYPE.BUILDING].footprints.length + map.buildings![BUILDING_TYPE.CASTLE_BUILDING].footprints.length);
	expect(layers.areas.length).toBeGreaterThan(0);
}

describe.skipIf(!hasSample('LobbyDemo.topo'))('LobbyDemo.topo (Arland)', () => {
	const data = readSample('LobbyDemo.topo');
	const map = data.byteLength ? parseTopo(data) : ({} as TopoMap);

	it('consumes every section exactly and keeps all geometry on the terrain', () => {
		checkStructure(data, map);
	});

	it('holds the expected records', () => {
		expect(map.roads!.typeCounts).toEqual([24, 0, 13, 60, 0, 28, 0, 0]);
		expect(map.roads!.lods.map((l) => l.length)).toEqual([125, 125, 125, 125, 125, 125]);
		expect(map.roads!.lods[0].reduce((n, r) => n + r.bridges.length, 0)).toBe(5);
		expect(map.powerLines!.every((lod) => lod.length === 0)).toBe(true);
		expect(map.buildings![BUILDING_TYPE.BUILDING].footprints).toHaveLength(346);
		expect(map.buildings![BUILDING_TYPE.BUILDING].anchors).toHaveLength(178);
		expect(map.buildings!.slice(1).every((g) => g.footprints.length === 0 && g.anchors.length === 0)).toBe(true);
		expect(map.areas!.trees.length / 2).toBe(65909);
		expect(map.water!.map((l) => l.length)).toEqual([14, 14, 12, 9, 8, 7]);
		expect(map.water![0].map((b) => b.type)).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
		expect(map.hills).toHaveLength(28);
	});

	it('stores road strips as quads that continue edge to edge', () => {
		for (const road of map.roads!.lods[0]) {
			const q = road.quads;
			for (let i = 8; i < q.length; i += 8) {
				// a = previous d, b = previous c
				expect([q[i], q[i + 1], q[i + 2], q[i + 3]]).toEqual([q[i - 2], q[i - 1], q[i - 4], q[i - 3]]);
			}
		}
	});

	it('flips map y to world z, so a building placed in the world lands in its footprint', () => {
		// Bunker_01 placed in worlds/Arland/LobbyDemo_Layers/structures.layer at world x 1966.477, z 2219.956.
		const layers = toLayers(map);
		expect(layers.buildings.some((ring) => contains(ring, 1966.477, 2219.956))).toBe(true);
		expect(layers.buildings.some((ring) => contains(ring, 1966.477, TERRAIN - 2219.956))).toBe(false);
	});

	it('emits bridge decks as their own road kind', () => {
		const layers = toLayers(map);
		expect(layers.roads.filter((r) => r.kind === ROAD_TYPE.BRIDGE)).toHaveLength(5);
		expect(layers.roads.filter((r) => r.kind === ROAD_TYPE.RUNWAY)).toHaveLength(24);
	});
});

describe.skipIf(!hasSample('Kunar.topo'))('Kunar.topo', () => {
	const data = readSample('Kunar.topo');
	const map = data.byteLength ? parseTopo(data) : ({} as TopoMap);

	it('consumes every section exactly and keeps all geometry on the terrain', () => {
		checkStructure(data, map);
	});

	it('holds the expected records', () => {
		expect(map.roads!.typeCounts).toEqual([6, 1, 13, 138, 0, 32, 0, 0]);
		expect(map.roads!.lods.map((l) => l.length)).toEqual([190, 190, 190, 190, 190, 190]);
		for (const lod of map.powerLines!) {
			expect(lod).toHaveLength(12);
			expect(lod.filter((l) => l.type === 1)).toHaveLength(7);
			expect(lod.filter((l) => l.type === 2)).toHaveLength(5);
		}
		expect(map.buildings![BUILDING_TYPE.BUILDING].footprints).toHaveLength(3565);
		expect(map.buildings![BUILDING_TYPE.BUILDING].anchors).toHaveLength(3536);
		expect(map.buildings![BUILDING_TYPE.WALL].footprints).toHaveLength(16356);
		expect(map.buildings![BUILDING_TYPE.WALL].anchors).toHaveLength(0);
		expect(map.areas!.trees.length / 2).toBe(208355);
		expect(map.water!.map((l) => l.length)).toEqual([33, 30, 24, 24, 22, 20]);
		expect(new Set(map.water![0].map((b) => b.type))).toEqual(new Set([0, 1, 2, 3]));
		expect(map.hills).toHaveLength(16);
	});

	it('leaves walls out of the layers, as the in-game map does', () => {
		expect(toLayers(map).buildings).toHaveLength(3565);
	});
});

// Synthetic files for the fail-soft paths.
class Builder {
	private bytes: number[] = [];
	u8(v: number): this {
		this.bytes.push(v & 255);
		return this;
	}
	u32(v: number): this {
		for (let i = 0; i < 4; i++) this.bytes.push((v >>> (i * 8)) & 255);
		return this;
	}
	f32(v: number): this {
		const b = new Uint8Array(new Float32Array([v]).buffer);
		this.bytes.push(...b);
		return this;
	}
	text(s: string): this {
		for (const c of s) this.bytes.push(c.charCodeAt(0));
		return this;
	}
	get length(): number {
		return this.bytes.length;
	}
	raw(): number[] {
		return this.bytes;
	}
}

function section(tag: string, version: number, payload: Builder, at: number): Builder {
	const b = new Builder().text(tag).u32(version).u32(payload.length).u32(at + 20 + payload.length).u32(0);
	for (const v of payload.raw()) b.u8(v);
	return b;
}

function file(sections: { tag: string; version: number; payload: Builder }[], magic = 'TOPO', version = 1): ArrayBuffer {
	const body: number[] = [];
	let at = 20;
	for (const s of sections) {
		const bytes = section(s.tag, s.version, s.payload, at).raw();
		body.push(...bytes);
		at += bytes.length;
	}
	const out = new Builder().text(magic).u32(version).u32(at - 20).u32(at).u32(0);
	for (const v of body) out.u8(v);
	out.text('_EOF');
	return new Uint8Array(out.raw()).buffer;
}

const oneHill = () => new Builder().u32(1).u32(0).f32(120).f32(100).f32(200).u32(0).u32(0);

describe('fail-soft parsing', () => {
	it('rejects a file without the TOPO magic', () => {
		expect(() => parseTopo(file([], 'POTO'))).toThrow(TopoFormatError);
		expect(() => parseTopo(new ArrayBuffer(8))).toThrow(TopoFormatError);
	});

	it('rejects an unknown file version', () => {
		expect(() => parseTopo(file([], 'TOPO', 2))).toThrow(/version 2/);
	});

	it('skips unknown sections by their end offset', () => {
		const map = parseTopo(file([
			{ tag: 'ZZZZ', version: 7, payload: new Builder().u32(1).u32(2).u8(3) },
			{ tag: 'HILL', version: 0, payload: oneHill() },
		]));
		expect(map.sections.map((s) => [s.tag, s.parsed])).toEqual([['ZZZZ', false], ['HILL', true]]);
		expect(map.hills).toEqual([{ elevation: 120, x: 100, y: 200, unknown: [0, 0, 0] }]);
		expect(map.warnings.join()).toMatch(/unknown section "ZZZZ"/);
	});

	it('drops a section whose layout does not fit and keeps reading', () => {
		const map = parseTopo(file([
			{ tag: 'HILL', version: 0, payload: new Builder().u32(5000).u32(0) },
			{ tag: 'WATR', version: 1, payload: new Builder().u32(0).u32(0) },
		]));
		expect(map.hills).toBeNull();
		expect(map.water).toBeNull();
		expect(map.warnings).toHaveLength(2);
	});

	it('skips a known section with an unexpected version', () => {
		const map = parseTopo(file([{ tag: 'HILL', version: 3, payload: oneHill() }]));
		expect(map.hills).toBeNull();
		expect(map.warnings.join()).toMatch(/HILL version 3/);
	});

	it('still finds the trees when area records of unknown layout are present', () => {
		const payload = new Builder().u32(1).u32(1).u32(0xdeadbeef).u32(77).u32(1).u32(0);
		payload.u32(2).f32(10).f32(20).f32(30).f32(40);
		const map = parseTopo(file([{ tag: 'AREA', version: 1, payload }]));
		expect(map.areas?.areasParsed).toBe(false);
		expect(Array.from(map.areas!.trees)).toEqual([10, 20, 30, 40]);
		expect(map.warnings.join()).toMatch(/unknown layout/);
	});
});
