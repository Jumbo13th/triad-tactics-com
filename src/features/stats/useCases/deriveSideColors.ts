import type { UnitScoreWithUnit } from '../domain/types';

/** Pick each faction's display color = the color most of its units belong to.
 * The rotation→color mapping is passed in as plain data (unitId → color) so
 * this stays inside the stats feature. */
export function deriveSideColors(
	scores: UnitScoreWithUnit[],
	factions: string[],
	colorByUnit: Record<number, string>
): Record<string, string> {
	const sideColors: Record<string, string> = {};

	for (const faction of factions) {
		const tally = new Map<string, number>();
		for (const score of scores) {
			if (score.side !== faction) continue;
			const color = colorByUnit[score.unitId];
			if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
		}

		let best = 0;
		for (const [color, count] of tally) {
			if (count > best) {
				best = count;
				sideColors[faction] = color;
			}
		}
	}

	return sideColors;
}
