import { splitFields } from './replayFormat';

// Who played a game, from its identity file ("I <pref> <identity GUID>") and its segments'
// name records (N <pref> "<name>"). A player's reference holds across the segments of a
// game, which is what joins the two.

export type ReplayPlayer = {
	ref: number;
	/** null for a player whose identity the server never learned. */
	identityGuid: string | null;
	/** One of the names the game displayed for the player; '' when it recorded none. */
	name: string;
};

export type PlayerIndex = {
	readIdentityLine: (line: string) => void;
	readSegmentLine: (line: string) => void;
	players: () => ReplayPlayer[];
};

const IDENTITY_LINE = /^I (\d{1,9}) ([0-9A-Za-z-]{1,64})$/;
const PLAYER_REF = /^\d{1,9}$/;

export function createPlayerIndex(): PlayerIndex {
	const guids = new Map<number, string>();
	const names = new Map<number, Set<string>>();

	return {
		readIdentityLine(line) {
			const match = IDENTITY_LINE.exec(line);
			// Lowercased to match users.arma_guid, which the site compares case-insensitively.
			if (match) guids.set(Number(match[1]), match[2].toLowerCase());
		},
		readSegmentLine(line) {
			// Name records are rare among the position records, so most lines stop here.
			if (!line.startsWith('N ')) return;
			const fields = splitFields(line);
			const ref = fields?.[1];
			const name = fields?.[2]?.trim();
			if (!ref || !PLAYER_REF.test(ref) || !name) return;
			const shown = names.get(Number(ref)) ?? new Set<string>();
			shown.add(name);
			names.set(Number(ref), shown);
		},
		players() {
			const refs = [...new Set([...guids.keys(), ...names.keys()])].sort((a, b) => a - b);
			return refs.flatMap((ref) => {
				const identityGuid = guids.get(ref) ?? null;
				const shown = [...(names.get(ref) ?? [])];
				return shown.length === 0 ? [{ ref, identityGuid, name: '' }] : shown.map((name) => ({ ref, identityGuid, name }));
			});
		},
	};
}
