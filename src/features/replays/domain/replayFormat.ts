// Reads ll-replay/1 recordings (the Lite Lobby recorder's format) into time-indexed tracks
// for the viewer. Runs in the browser: no Node APIs.
//
// Time `t` is mission time in tenths of a second. Entity, player, weapon, area and zone
// numbers hold across a recording's segments; squad, slot and marker numbers are local to
// a segment, so they are keyed by segment here.

export type EntityKind =
	| 'man'
	| 'car'
	| 'truck'
	| 'apc'
	| 'tracked'
	| 'heli'
	| 'plane'
	| 'static'
	| 'mortar'
	| 'vehicle'
	| 'tracker';

export type Side = { key: string; name: string; color: string };

export type Track = { t: number[]; x: number[]; z: number[]; h: number[] };

export type Change<T> = { t: number; value: T };

export type Life = 'alive' | 'unconscious' | 'dead';

export type Seat = { vehicle: number; role: string; seat: string } | null;

export type Entity = {
	eid: number;
	kind: EntityKind;
	side: string | null;
	/** Group key per segment index. */
	groups: Map<number, string>;
	prefab: string;
	name: string;
	appearedAt: number;
	removedAt: number | null;
	track: Track;
	life: Change<Life>[];
	seats: Change<Seat>[];
};

export type Group = { key: string; segment: number; side: string | null; callsign: string };

export type Slot = { key: string; segment: number; group: string; side: string | null; role: string; occupants: Change<number | null>[] };

export type Player = { pref: number; names: Change<string>[]; connected: Change<boolean>[]; controls: Change<number | null>[] };

export type Weapon = { wid: number; type: string; name: string };

export type Marker = {
	key: string;
	type: string;
	x: number;
	z: number;
	rotation: number;
	pref: number | null;
	sides: string;
	icon: string;
	color: string | null;
	text: string;
	placedAt: number;
	removedAt: number | null;
};

export type Area = {
	aid: number;
	sides: string;
	fill: string | null;
	outline: string | null;
	width: number;
	open: boolean;
	label: string;
	points: number[];
	shown: Change<boolean>[];
};

export type Zone = {
	zid: number;
	attacker: string | null;
	defender: string | null;
	label: string;
	points: number[];
	holders: Change<string | null>[];
};

export type ReplayEvent =
	| { t: number; type: 'kill'; victim: number; killer: number | null; relation: string; cause: string | null; weapon: number | null; distance: number | null }
	| { t: number; type: 'down'; victim: number; attacker: number | null; cause: string | null; weapon: number | null; distance: number | null }
	| { t: number; type: 'up'; victim: number }
	| { t: number; type: 'capture'; zid: number; side: string }
	| { t: number; type: 'trigger'; key: string; label: string }
	| { t: number; type: 'flow'; flow: 'game' | 'freeze' | 'freeze-end' | 'hardfreeze' | 'hardfreeze-end'; seconds: number | null }
	| { t: number; type: 'resume'; segment: number };

export type Shot = { t: number; eid: number; shots: number; heading: number; weapon: number | null };

export type Detonation = { t: number; x: number; z: number; kind: string; shooter: number | null; weapon: number | null };

export type SegmentInfo = {
	index: number;
	number: number;
	/** Mission time the segment starts from: 0, or the time it resumed from. */
	startsAt: number;
	startedUnix: number | null;
};

export type ReplayModel = {
	session: string;
	mission: string;
	author: string;
	world: string;
	bounds: [number, number, number, number];
	date: number[] | null;
	sides: Side[];
	segments: SegmentInfo[];
	duration: number;
	/** Pairs of (unix seconds, t) for telling real time. */
	anchors: { unix: number; t: number }[];
	entities: Map<number, Entity>;
	groups: Map<string, Group>;
	slots: Map<string, Slot>;
	players: Map<number, Player>;
	weapons: Map<number, Weapon>;
	markers: Map<string, Marker>;
	areas: Map<number, Area>;
	zones: Map<number, Zone>;
	events: ReplayEvent[];
	shots: Shot[];
	detonations: Detonation[];
};

const KINDS = new Set<EntityKind>(['man', 'car', 'truck', 'apc', 'tracked', 'heli', 'plane', 'static', 'mortar', 'vehicle', 'tracker']);
const FALLBACK_SIDE_COLORS = ['#048de7', '#da0807', '#2f9e44', '#8e44ad', '#e67e22', '#16a085'];

/** Splits a record into fields; a field that starts with a double quote is a JSON string. */
export function splitFields(line: string): string[] | null {
	const fields: string[] = [];
	let i = 0;
	const n = line.length;
	while (i < n) {
		if (line[i] === ' ') {
			i++;
			continue;
		}
		if (line[i] === '"') {
			let j = i + 1;
			while (j < n && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
			if (j >= n) return null;
			try {
				fields.push(JSON.parse(line.slice(i, j + 1)) as string);
			} catch {
				return null;
			}
			i = j + 1;
			continue;
		}
		let j = i;
		while (j < n && line[j] !== ' ') j++;
		fields.push(line.slice(i, j));
		i = j;
	}
	return fields;
}

function int(value: string | undefined): number | null {
	if (value === undefined || value === '-') return null;
	const n = Number(value);
	return Number.isInteger(n) ? n : null;
}

function opt(value: string | undefined): string | null {
	return value === undefined || value === '-' ? null : value;
}

function color(value: string | undefined): string | null {
	if (!value || value === '-' || !/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return null;
	return `#${value.toLowerCase()}`;
}

function points(fields: string[], from: number): number[] {
	const out: number[] = [];
	for (let i = from; i + 1 < fields.length; i += 2) {
		const x = Number(fields[i]);
		const z = Number(fields[i + 1]);
		if (Number.isFinite(x) && Number.isFinite(z)) out.push(x, z);
	}
	return out;
}

/** Drops every entry later than `t`: what a crash rolled back never happened. */
function cut<T extends { t: number }>(list: T[], t: number): void {
	let n = list.length;
	while (n > 0 && list[n - 1].t > t) n--;
	list.length = n;
}

function cutTrack(track: Track, t: number): void {
	let n = track.t.length;
	while (n > 0 && track.t[n - 1] > t) n--;
	track.t.length = n;
	track.x.length = n;
	track.z.length = n;
	track.h.length = n;
}

function setChange<T>(list: Change<T>[], t: number, value: T): void {
	const last = list[list.length - 1];
	if (last && last.value === value) return;
	if (last && last.t === t) {
		last.value = value;
		return;
	}
	list.push({ t, value });
}

export function emptyModel(): ReplayModel {
	return {
		session: '',
		mission: '',
		author: '',
		world: '',
		bounds: [0, 0, 0, 0],
		date: null,
		sides: [],
		segments: [],
		duration: 0,
		anchors: [],
		entities: new Map(),
		groups: new Map(),
		slots: new Map(),
		players: new Map(),
		weapons: new Map(),
		markers: new Map(),
		areas: new Map(),
		zones: new Map(),
		events: [],
		shots: [],
		detonations: [],
	};
}

function rollBack(model: ReplayModel, t: number): void {
	model.duration = Math.min(model.duration, t);
	cut(model.events, t);
	cut(model.shots, t);
	cut(model.detonations, t);
	cut(model.anchors, t);
	for (const entity of model.entities.values()) {
		cutTrack(entity.track, t);
		cut(entity.life, t);
		cut(entity.seats, t);
		if (entity.removedAt !== null && entity.removedAt > t) entity.removedAt = null;
	}
	for (const [eid, entity] of model.entities) if (entity.appearedAt > t) model.entities.delete(eid);
	for (const slot of model.slots.values()) cut(slot.occupants, t);
	for (const player of model.players.values()) {
		cut(player.names, t);
		cut(player.connected, t);
		cut(player.controls, t);
	}
	for (const [key, marker] of model.markers) {
		if (marker.placedAt > t) model.markers.delete(key);
		else if (marker.removedAt !== null && marker.removedAt > t) marker.removedAt = null;
	}
	for (const area of model.areas.values()) cut(area.shown, t);
	for (const zone of model.zones.values()) cut(zone.holders, t);
}

function player(model: ReplayModel, pref: number): Player {
	let found = model.players.get(pref);
	if (!found) {
		found = { pref, names: [], connected: [], controls: [] };
		model.players.set(pref, found);
	}
	return found;
}

/**
 * Adds one segment file to the model. Segments must be added in order; a segment that
 * resumed after a crash rolls back what the earlier ones recorded after its resume time.
 */
export function addSegment(model: ReplayModel, text: string): void {
	const segmentIndex = model.segments.length;
	const lines = text.split('\n');
	// A last line without its line feed was cut off by a crash.
	if (!text.endsWith('\n')) lines.pop();

	let t = 0;
	let inHeader = true;
	let segmentNumber = segmentIndex + 1;
	let startedUnix: number | null = null;
	let resumedAt: number | null = null;
	const headerSides: Side[] = [];

	for (const raw of lines) {
		const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (line.length === 0) continue;
		const f = splitFields(line);
		if (!f || f.length === 0) continue;

		if (inHeader) {
			if (f[0] === 'LLR') continue;
			if (f[0] !== 'H') {
				inHeader = false;
			} else {
				switch (f[1]) {
					case 'session':
						model.session = f[2] ?? model.session;
						break;
					case 'segment':
						segmentNumber = int(f[2]) ?? segmentNumber;
						break;
					case 'mission':
						model.mission = f[2] ?? model.mission;
						break;
					case 'author':
						model.author = f[2] ?? model.author;
						break;
					case 'world':
						model.world = f[2] ?? model.world;
						break;
					case 'bounds': {
						const b = f.slice(2, 6).map(Number);
						if (b.length === 4 && b.every(Number.isFinite)) model.bounds = [b[0], b[1], b[2], b[3]];
						break;
					}
					case 'date':
						if (segmentIndex === 0) model.date = f.slice(2, 7).map(Number);
						break;
					case 'started':
						startedUnix = int(f[2]);
						break;
					case 'resumed':
						resumedAt = int(f[2]);
						break;
					case 'side': {
						const key = f[2];
						if (key) {
							headerSides.push({
								key,
								name: f[3] ?? key,
								color: color(f[4]) ?? FALLBACK_SIDE_COLORS[headerSides.length % FALLBACK_SIDE_COLORS.length],
							});
						}
						break;
					}
					case 'end':
						inHeader = false;
						if (resumedAt !== null && segmentIndex > 0) {
							rollBack(model, resumedAt);
							model.events.push({ t: resumedAt, type: 'resume', segment: segmentNumber });
						}
						for (const side of headerSides) {
							if (!model.sides.some((s) => s.key === side.key)) model.sides.push(side);
						}
						model.segments.push({
							index: segmentIndex,
							number: segmentNumber,
							startsAt: resumedAt ?? 0,
							startedUnix,
						});
						t = resumedAt ?? 0;
						break;
				}
				continue;
			}
			if (model.segments.length === segmentIndex) {
				model.segments.push({ index: segmentIndex, number: segmentNumber, startsAt: resumedAt ?? 0, startedUnix });
			}
		}

		switch (f[0]) {
			case 'T': {
				const value = int(f[1]);
				if (value !== null) t = value;
				if (t > model.duration) model.duration = t;
				break;
			}
			case 'U': {
				const unix = int(f[1]);
				const at = int(f[2]);
				if (unix !== null && at !== null) model.anchors.push({ unix, t: at });
				break;
			}
			case 'W': {
				const wid = int(f[1]);
				if (wid !== null) model.weapons.set(wid, { wid, type: f[2] ?? 'other', name: f[3] ?? '' });
				break;
			}
			case 'GROUP': {
				const gid = int(f[1]);
				if (gid === null) break;
				const key = `${segmentIndex}:${gid}`;
				model.groups.set(key, { key, segment: segmentIndex, side: opt(f[2]), callsign: f[3] ?? '' });
				break;
			}
			case 'N': {
				const pref = int(f[1]);
				if (pref !== null && f[2] !== undefined) setChange(player(model, pref).names, t, f[2]);
				break;
			}
			case 'S': {
				const slot = int(f[1]);
				const gid = int(f[2]);
				if (slot === null || gid === null) break;
				const key = `${segmentIndex}:${slot}`;
				if (!model.slots.has(key)) {
					model.slots.set(key, {
						key,
						segment: segmentIndex,
						group: `${segmentIndex}:${gid}`,
						side: opt(f[3]),
						role: f[4] ?? '',
						occupants: [],
					});
				}
				break;
			}
			case 'O': {
				const slot = model.slots.get(`${segmentIndex}:${f[1]}`);
				if (slot) setChange(slot.occupants, t, int(f[2]));
				break;
			}
			case 'D': {
				const pref = int(f[1]);
				if (pref !== null) setChange(player(model, pref).connected, t, f[2] === '1');
				break;
			}
			case 'C': {
				const pref = int(f[1]);
				if (pref !== null) setChange(player(model, pref).controls, t, int(f[2]));
				break;
			}
			case 'E': {
				const eid = int(f[1]);
				const kind = f[2] as EntityKind;
				if (eid === null || !KINDS.has(kind)) break;
				let entity = model.entities.get(eid);
				if (!entity) {
					entity = {
						eid,
						kind,
						side: kind === 'tracker' ? (f[3] ?? null) : opt(f[3]),
						groups: new Map(),
						prefab: f[5] ?? '',
						name: f[6] ?? '',
						appearedAt: t,
						removedAt: null,
						track: { t: [], x: [], z: [], h: [] },
						life: [{ t, value: 'alive' }],
						seats: [],
					};
					model.entities.set(eid, entity);
				} else if (entity.removedAt !== null) {
					entity.removedAt = null;
				}
				const gid = int(f[4]);
				if (gid !== null) entity.groups.set(segmentIndex, `${segmentIndex}:${gid}`);
				break;
			}
			case 'P': {
				const entity = model.entities.get(int(f[1]) ?? -1);
				if (!entity) break;
				const x = Number(f[2]);
				const z = Number(f[3]);
				const h = Number(f[5]);
				if (!Number.isFinite(x) || !Number.isFinite(z)) break;
				const track = entity.track;
				const last = track.t.length - 1;
				if (last >= 0 && track.t[last] === t) {
					track.x[last] = x;
					track.z[last] = z;
					track.h[last] = Number.isFinite(h) ? h : track.h[last];
				} else {
					track.t.push(t);
					track.x.push(x);
					track.z.push(z);
					track.h.push(Number.isFinite(h) ? h : 0);
				}
				break;
			}
			case 'Q': {
				const entity = model.entities.get(int(f[1]) ?? -1);
				if (entity && entity.removedAt === null) entity.removedAt = t;
				break;
			}
			case 'L': {
				const eid = int(f[1]);
				const entity = model.entities.get(eid ?? -1);
				if (eid === null || !entity) break;
				if (f[2] === 'u') {
					const already = entity.life[entity.life.length - 1]?.value === 'unconscious';
					setChange(entity.life, t, 'unconscious');
					if (!already) {
						model.events.push({
							t,
							type: 'down',
							victim: eid,
							attacker: int(f[3]),
							cause: opt(f[4]),
							weapon: int(f[5]),
							distance: int(f[6]),
						});
					}
				} else if (f[2] === 'a') {
					if (entity.life[entity.life.length - 1]?.value === 'unconscious') {
						setChange(entity.life, t, 'alive');
						model.events.push({ t, type: 'up', victim: eid });
					}
				}
				break;
			}
			case 'K': {
				const victim = int(f[1]);
				const entity = model.entities.get(victim ?? -1);
				if (victim === null || !entity || entity.life[entity.life.length - 1]?.value === 'dead') break;
				setChange(entity.life, t, 'dead');
				model.events.push({
					t,
					type: 'kill',
					victim,
					killer: int(f[2]),
					relation: f[3] ?? 'none',
					cause: opt(f[4]),
					weapon: int(f[5]),
					distance: int(f[6]),
				});
				break;
			}
			case 'V': {
				const entity = model.entities.get(int(f[1]) ?? -1);
				if (!entity) break;
				const vehicle = int(f[2]);
				const seat: Seat = vehicle === null ? null : { vehicle, role: f[3] ?? 'cargo', seat: f[4] ?? '' };
				const last = entity.seats[entity.seats.length - 1]?.value ?? null;
				const same = last === null ? seat === null : seat !== null && last.vehicle === seat.vehicle && last.seat === seat.seat;
				if (!same) entity.seats.push({ t, value: seat });
				break;
			}
			case 'F': {
				const eid = int(f[1]);
				const shots = int(f[2]);
				if (eid === null || shots === null) break;
				model.shots.push({ t, eid, shots, heading: Number(f[3]) || 0, weapon: int(f[4]) });
				break;
			}
			case 'B': {
				const x = Number(f[1]);
				const z = Number(f[2]);
				if (!Number.isFinite(x) || !Number.isFinite(z)) break;
				model.detonations.push({ t, x, z, kind: f[4] ?? 'shell', shooter: int(f[5]), weapon: int(f[6]) });
				break;
			}
			case 'M+': {
				const key = `${segmentIndex}:${f[1]}`;
				if (model.markers.has(key) || f.length < 11) break;
				model.markers.set(key, {
					key,
					type: f[2],
					x: Number(f[3]),
					z: Number(f[4]),
					rotation: Number(f[5]) || 0,
					pref: int(f[6]),
					sides: f[7],
					icon: f[8],
					color: color(f[9]),
					text: f[10],
					placedAt: t,
					removedAt: null,
				});
				break;
			}
			case 'M-': {
				const marker = model.markers.get(`${segmentIndex}:${f[1]}`);
				if (marker && marker.removedAt === null) marker.removedAt = t;
				break;
			}
			case 'A': {
				const aid = int(f[1]);
				if (aid === null || model.areas.has(aid)) break;
				model.areas.set(aid, {
					aid,
					sides: f[2] ?? '*',
					fill: color(f[3]),
					outline: color(f[4]),
					width: Number(f[5]) || 1,
					open: f[6] === '1',
					label: f[7] ?? '',
					points: points(f, 8),
					shown: [],
				});
				break;
			}
			case 'AV': {
				const area = model.areas.get(int(f[1]) ?? -1);
				if (area) setChange(area.shown, t, f[2] === '1');
				break;
			}
			case 'Z': {
				const zid = int(f[1]);
				if (zid === null || model.zones.has(zid)) break;
				model.zones.set(zid, { zid, attacker: opt(f[2]), defender: opt(f[3]), label: f[4] ?? '', points: points(f, 5), holders: [] });
				break;
			}
			case 'ZH': {
				const zone = model.zones.get(int(f[1]) ?? -1);
				if (zone) setChange(zone.holders, t, opt(f[2]));
				break;
			}
			case 'ZC': {
				const zid = int(f[1]);
				if (zid !== null && f[2]) model.events.push({ t, type: 'capture', zid, side: f[2] });
				break;
			}
			case 'TR':
				model.events.push({ t, type: 'trigger', key: f[1] ?? '', label: f[2] ?? '' });
				break;
			case 'FLOW': {
				const flow = f[1];
				if (flow === 'game' || flow === 'freeze' || flow === 'freeze-end' || flow === 'hardfreeze' || flow === 'hardfreeze-end') {
					const last = model.events[model.events.length - 1];
					const seconds = int(f[2]);
					// Snapshots restate a running freeze; keep the first statement of each.
					const repeat = last && last.type === 'flow' && last.flow === flow && last.t === t;
					if (!repeat) model.events.push({ t, type: 'flow', flow, seconds });
				}
				break;
			}
		}
	}
	if (t > model.duration) model.duration = t;
}

/** Index of the last entry at or before `t`, or -1. */
export function lastAtOrBefore(times: ArrayLike<number>, t: number): number {
	let lo = 0;
	let hi = times.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= t) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

export function valueAt<T>(changes: Change<T>[], t: number, fallback: T): T {
	let lo = 0;
	let hi = changes.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (changes[mid].t <= t) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found < 0 ? fallback : changes[found].value;
}

/** Characters are sampled every second, vehicles every half second (tenths). */
function samplePeriod(kind: EntityKind): number {
	return kind === 'man' ? 10 : 5;
}

/**
 * Where an entity is at `t`. A position is written only after a move, so a gap longer than
 * the sampling period means the entity stood still until the period before the next sample.
 */
export function positionAt(entity: Entity, t: number): { x: number; z: number; h: number } | null {
	const track = entity.track;
	const i = lastAtOrBefore(track.t, t);
	if (i < 0) return null;
	if (i === track.t.length - 1) return { x: track.x[i], z: track.z[i], h: track.h[i] };
	const t1 = track.t[i + 1];
	const moveFrom = Math.max(track.t[i], t1 - samplePeriod(entity.kind));
	if (t <= moveFrom) return { x: track.x[i], z: track.z[i], h: track.h[i] };
	const k = (t - moveFrom) / (t1 - moveFrom);
	let dh = track.h[i + 1] - track.h[i];
	if (dh > 180) dh -= 360;
	else if (dh < -180) dh += 360;
	return {
		x: track.x[i] + (track.x[i + 1] - track.x[i]) * k,
		z: track.z[i] + (track.z[i + 1] - track.z[i]) * k,
		h: (track.h[i] + dh * k + 360) % 360,
	};
}

/** The segment in play at `t`. */
export function segmentAt(model: ReplayModel, t: number): number {
	let index = 0;
	for (const segment of model.segments) if (segment.startsAt <= t) index = segment.index;
	return index;
}

/** Real time at `t` from the nearest wall-clock anchor at or before it. */
export function unixAt(model: ReplayModel, t: number): number | null {
	let best: { unix: number; t: number } | null = null;
	for (const anchor of model.anchors) {
		if (anchor.t <= t && (!best || anchor.t >= best.t)) best = anchor;
	}
	return best ? best.unix + Math.round((t - best.t) / 10) : null;
}
