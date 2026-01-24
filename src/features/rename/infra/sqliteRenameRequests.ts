import { getDb } from '@/platform/db/connection';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function hasPendingRenameRequestByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT 1
		FROM rename_requests
		WHERE user_id = ? AND status = 'pending'
		LIMIT 1
	`);
	return !!stmt.get(userId);
}

export function getLatestDeclineReasonByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT decline_reason
		FROM rename_requests
		WHERE user_id = ?
			AND status = 'declined'
			AND decline_reason IS NOT NULL
			AND TRIM(decline_reason) != ''
		ORDER BY decided_at DESC, created_at DESC
		LIMIT 1
	`);
	const row = stmt.get(userId) as { decline_reason?: string | null } | undefined;
	const reason = row?.decline_reason ?? null;
	return reason && reason.trim() ? reason : null;
}

export function createRenameRequest(input: { userId: number; newCallsign: string }) {
	const db = getDb();
	const isOldCallsignNullable = () => {
		try {
			const cols = db.prepare('PRAGMA table_info(rename_requests)').all() as Array<
				| { name?: unknown; notnull?: unknown }
				| Record<string, unknown>
			>;
			const col = cols.find((c) => isRecord(c) && c.name === 'old_callsign');
			if (!col || !isRecord(col)) return false;
			return col.notnull === 0;
		} catch {
			return false;
		}
	};
	const selectUser = db.prepare(`
		SELECT u.id, u.current_callsign, rrq.required_at as rename_required_at
		FROM users u
		LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
		WHERE u.id = ?
	`);
	const insert = db.prepare(`
		INSERT INTO rename_requests (user_id, old_callsign, new_callsign, status)
		VALUES (?, ?, ?, 'pending')
	`);

	try {
		const run = db.transaction(() => {
			const user = selectUser.get(input.userId) as
				| {
						id: number;
						current_callsign: string | null;
						rename_required_at: string | null;
				  }
				| undefined;
			if (!user) return { success: false as const, error: 'not_found' as const };
			if (!user.rename_required_at) return { success: false as const, error: 'rename_not_required' as const };

			// Old callsign is stored for admin/audit context, but should never block the request.
			const oldCallsign = (user.current_callsign ?? '').trim();
			const oldCallsignForDb = (() => {
				if (oldCallsign) return oldCallsign;
				return isOldCallsignNullable() ? null : '(unknown)';
			})();

			const info = insert.run(input.userId, oldCallsignForDb, input.newCallsign);
			return { success: true as const, id: info.lastInsertRowid };
		});
		return run();
	} catch (error: unknown) {
		const code =
			isRecord(error) && typeof error.code === 'string' ? (error.code as string) : '';
		if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
			return { success: false as const, error: 'duplicate_pending' as const };
		}
		return { success: false as const, error: 'database_error' as const };
	}
}
