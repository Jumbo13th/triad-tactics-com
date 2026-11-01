/** Mission time (tenths of a second) as h:mm:ss. */
export function formatMissionTime(t: number): string {
	const total = Math.max(0, Math.floor(t / 10));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
