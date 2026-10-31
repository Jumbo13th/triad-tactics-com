import { describe, expect, it } from 'vitest';
import {
	addSegment,
	emptyModel,
	positionAt,
	segmentAt,
	splitFields,
	unixAt,
	valueAt,
} from '@/features/replays/domain/replayFormat';
import { gameName } from '@/features/replays/ui/viewer/gameNames';

const SEGMENT_1 = [
	'LLR 1',
	'H session 20261031-201500-eden',
	'H segment 1',
	'H mission "Operation \\"Example\\""',
	'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
	'H bounds 0 0 1000 1000',
	'H date 1989 6 21 5 30',
	'H started 1793563200',
	'H side US "#AR-Faction_US" 048de7',
	'H side USSR "#AR-Faction_USSR" da0807',
	'H end',
	'U 1793563200 0',
	'W 1 rifle "#AR-Weapon_M16A2_Name"',
	'GROUP 1 US "#AR-Callsign_US_Company_A #AR-Callsign_US_Platoon_1 2"',
	'S 10 1 US "#AR-Role_SquadLeader"',
	'N 1 "[ABC] Player One"',
	'E 1 man US 1 Character_US_SL "#AR-Role_SquadLeader"',
	'E 2 man USSR - Character_USSR_Rifleman "#AR-Role_Rifleman"',
	'P 1 100 100 10 0',
	'P 2 200 200 10 180',
	'O 10 1',
	'C 1 1',
	'A 1 * 80600064 806000ff 4 0 "Objective" 10 10 20 10 20 20',
	'AV 1 1',
	'T 10',
	'P 1 101 100 10 0',
	'T 100',
	'P 1 110 100 10 90',
	'F 1 3 90 1',
	'T 120',
	'L 2 u 1 kinetic 1 50',
	'T 130',
	'K 2 1 enemy kinetic 1 50',
	'M+ g1 custom 150 150 0 1 US "danger" ff3030 "MG here"',
	'T 200',
	'P 1 300 300 10 0',
	'STOP shutdown',
	'P 1 999 999 10 0',
].join('\n');
// The last line has no line feed: the crash cut it off, so it is ignored.

const SEGMENT_2 = [
	'LLR 1',
	'H session 20261031-201500-eden',
	'H segment 2',
	'H mission "Operation \\"Example\\""',
	'H world "{853E92315D1D9EFE}worlds/Eden/Eden.ent"',
	'H bounds 0 0 1000 1000',
	'H started 1793563800',
	'H resumed 110',
	'H side US "#AR-Faction_US" 048de7',
	'H side USSR "#AR-Faction_USSR" da0807',
	'H end',
	'U 1793563800 110',
	'SNAP',
	'GROUP 1 US "#AR-Callsign_US_Company_A #AR-Callsign_US_Platoon_1 2"',
	'E 1 man US 1 Character_US_SL "#AR-Role_SquadLeader"',
	'E 2 man USSR - Character_USSR_Rifleman "#AR-Role_Rifleman"',
	'P 1 110 100 10 90',
	'SNAP-END',
	'T 150',
	'P 1 120 120 10 45',
	'',
].join('\n');

describe('splitFields', () => {
	it('reads JSON strings with spaces and escapes as one field', () => {
		expect(splitFields('N 1 "[ABC] Player One"')).toEqual(['N', '1', '[ABC] Player One']);
		expect(splitFields('H mission "Operation \\"Example\\""')).toEqual(['H', 'mission', 'Operation "Example"']);
		expect(splitFields('M+ g1 custom 1 2 0 - * "" - ""')).toEqual(['M+', 'g1', 'custom', '1', '2', '0', '-', '*', '', '-', '']);
	});

	it('refuses an unterminated string', () => {
		expect(splitFields('N 1 "broken')).toBeNull();
	});
});

describe('addSegment', () => {
	it('reads one segment', () => {
		const model = emptyModel();
		addSegment(model, SEGMENT_1);
		expect(model.mission).toBe('Operation "Example"');
		expect(model.bounds).toEqual([0, 0, 1000, 1000]);
		expect(model.sides).toEqual([
			{ key: 'US', name: '#AR-Faction_US', color: '#048de7' },
			{ key: 'USSR', name: '#AR-Faction_USSR', color: '#da0807' },
		]);
		expect(model.duration).toBe(200);
		expect(model.entities.get(1)?.track.x).toEqual([100, 101, 110, 300]);
		expect(model.events.map((e) => e.type)).toEqual(['down', 'kill']);
		expect(model.shots).toEqual([{ t: 100, eid: 1, shots: 3, heading: 90, weapon: 1 }]);
		expect(valueAt(model.entities.get(2)!.life, 130, 'alive')).toBe('dead');
		expect(model.markers.get('0:g1')?.text).toBe('MG here');
		expect(valueAt(model.players.get(1)!.names, 0, '')).toBe('[ABC] Player One');
		expect(model.areas.get(1)?.points).toEqual([10, 10, 20, 10, 20, 20]);
	});

	it('rolls back what a crash undid when the next segment resumes', () => {
		const model = emptyModel();
		addSegment(model, SEGMENT_1);
		addSegment(model, SEGMENT_2);
		expect(model.segments.map((s) => [s.number, s.startsAt])).toEqual([
			[1, 0],
			[2, 110],
		]);
		expect(model.duration).toBe(150);
		const soldier = model.entities.get(1)!;
		expect(soldier.track.t).toEqual([0, 10, 100, 110, 150]);
		expect(valueAt(model.entities.get(2)!.life, 200, 'alive')).toBe('alive');
		expect(model.markers.size).toBe(0);
		expect(model.events.map((e) => e.type)).toEqual(['resume']);
		expect([...model.groups.keys()]).toEqual(['0:1', '1:1']);
		expect(soldier.groups.get(1)).toBe('1:1');
		expect(segmentAt(model, 50)).toBe(0);
		expect(segmentAt(model, 120)).toBe(1);
		expect(unixAt(model, 130)).toBe(1793563802);
	});
});

describe('positionAt', () => {
	it('holds a soldier still until the second before his next position', () => {
		const model = emptyModel();
		addSegment(model, SEGMENT_1);
		const soldier = model.entities.get(1)!;
		expect(positionAt(soldier, 50)).toEqual({ x: 101, z: 100, h: 0 });
		expect(positionAt(soldier, 95)).toMatchObject({ x: 105.5, z: 100, h: 45 });
		expect(positionAt(soldier, -1)).toBeNull();
	});
});

describe('gameName', () => {
	const names = {
		'AR-Callsign_US_Company_A': 'Atlas',
		'AR-Callsign_US_Platoon_1': 'Red',
		'AR-Callsign_FIA_Company_0': 'Racek',
		'AR-Role_SquadLeader': 'Squad Leader',
	};

	it('translates each key of a composite callsign', () => {
		expect(gameName(names, '#AR-Callsign_US_Company_A #AR-Callsign_US_Platoon_1 2')).toBe('Atlas Red 2');
		expect(gameName(names, '#AR-Callsign_FIA_Company_0-31')).toBe('Racek-31');
	});

	it('leaves plain text alone and makes unknown keys readable', () => {
		expect(gameName(names, '[ABC] Player One')).toBe('[ABC] Player One');
		expect(gameName(names, '#TT-Faction_Wolverine')).toBe('Wolverine');
		expect(gameName(names, '#AR-Weapon_SVD_Name')).toBe('SVD');
	});
});
