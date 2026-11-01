// The replay list groups games by the day they were played in the viewer's time zone; days
// are keyed YYYY-MM-DD so they compare and shift without a zone.

const dayFormats = new Map<string, Intl.DateTimeFormat>();

export function dayKey(unixSeconds: number, timeZone: string): string {
	let format = dayFormats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
		dayFormats.set(timeZone, format);
	}
	const parts = format.formatToParts(new Date(unixSeconds * 1000));
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Calendar arithmetic on the key itself, so a daylight saving change cannot skip or repeat a day. */
export function shiftDayKey(key: string, days: number): string {
	const [year, month, date] = key.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** The key as a date at midnight UTC, to format the day it names with timeZone UTC. */
export function dayKeyDate(key: string): Date {
	return new Date(`${key}T00:00:00Z`);
}

export type ReplayDay<T> = {
	/** null for games without a start time. */
	key: string | null;
	replays: T[];
};

/** Runs of games on the same day, in the order given. */
export function groupByDay<T extends { startedAt: number | null }>(replays: T[], timeZone: string): ReplayDay<T>[] {
	const days: ReplayDay<T>[] = [];
	for (const replay of replays) {
		const key = replay.startedAt === null ? null : dayKey(replay.startedAt, timeZone);
		const last = days[days.length - 1];
		if (last && last.key === key) last.replays.push(replay);
		else days.push({ key, replays: [replay] });
	}
	return days;
}
