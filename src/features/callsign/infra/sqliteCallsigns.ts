import { getDb } from '@/platform/db/connection';

export function listCallsigns(scope?: { includeActive?: boolean; includeConfirmed?: boolean }) {
	const includeActive = scope?.includeActive !== false;
	const includeConfirmed = scope?.includeConfirmed !== false;
	const db = getDb();
	// Callsign uniqueness/search should be based on canonical user state, not historical application JSON.
	// We keep "active/confirmed" options for API compatibility, but they currently don't affect user callsigns.
	void includeActive;
	void includeConfirmed;
	const stmt = db.prepare(`
		SELECT current_callsign as callsign
		FROM users
		WHERE current_callsign IS NOT NULL
	`);
	const rows = stmt.all() as Array<{ callsign: string | null }>;
	return rows
		.map((r) => (typeof r.callsign === 'string' ? r.callsign.trim() : ''))
		.filter((v) => v.length > 0);
}
