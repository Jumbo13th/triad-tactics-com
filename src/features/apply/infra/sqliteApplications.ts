import type { Application } from '@/features/apply/domain/types';
import { getDb } from '@/platform/db/connection';
import { getOrCreateUserBySteamId64 } from '@/features/users/infra/sqliteUsers';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

type ApplicationRow = {
	id: number;
	user_id: number | null;
	email: string;
	steamid64: string;
	persona_name: string | null;
	answers: string;
	ip_address: string | null;
	locale: string | null;
	created_at: string;
	confirmed_at: string | null;
	confirmed_by_steamid64: string | null;
};

export function normalizeApplicationAnswers(raw: string): Application['answers'] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		parsed = null;
	}

	if (!isRecord(parsed)) {
		return {
			callsign: '',
			name: '',
			age: '',
			city: '',
			country: '',
			availability: '',
			timezone: '',
			experience: '',
			motivation: ''
		};
	}

	const callsign = typeof parsed.callsign === 'string' ? parsed.callsign : '';
	const name = typeof parsed.name === 'string' ? parsed.name : '';

	return {
		...(parsed as Omit<Application['answers'], 'callsign' | 'name'>),
		callsign,
		name
	} as Application['answers'];
}

export function insertApplication(
	application: Omit<Application, 'id' | 'created_at'>
):
	| { success: true; id: unknown }
	| { success: false; error: 'duplicate' | 'constraint_error' | 'database_error' } {
	const db = getDb();
	const ensured = getOrCreateUserBySteamId64({
		steamid64: application.steamid64
	});
	const userId = ensured.success ? ensured.user.id : null;
	const seedUserCallsign = db.prepare(`
		UPDATE users
		SET current_callsign = CASE
			WHEN current_callsign IS NULL OR TRIM(current_callsign) = '' OR current_callsign = ?
			THEN ?
			ELSE current_callsign
		END
		WHERE id = ?
	`);
	const stmt = db.prepare(`
		INSERT INTO applications (email, steamid64, persona_name, answers, ip_address, locale, user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);

	try {
		if (userId != null) {
			const callsign = (application.answers?.callsign ?? '').trim();
			if (callsign) {
				seedUserCallsign.run(`Steam_${application.steamid64.trim()}`, callsign, userId);
			}
		}

		const info = stmt.run(
			application.email,
			application.steamid64,
			application.persona_name ?? null,
			JSON.stringify(application.answers),
			application.ip_address || null,
			application.locale || 'en',
			userId
		);
		return { success: true, id: info.lastInsertRowid };
	} catch (error: unknown) {
		const code =
			isRecord(error) && typeof error.code === 'string' ? (error.code as string) : '';
		if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
			return { success: false, error: 'duplicate' };
		}
		if (code.startsWith('SQLITE_CONSTRAINT')) {
			return { success: false, error: 'constraint_error' };
		}
		return { success: false, error: 'database_error' };
	}
}

export function getAllApplications() {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT id, user_id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
		FROM applications
		ORDER BY created_at DESC
	`);

	const rows = stmt.all() as ApplicationRow[];
	return rows.map((row) => ({
		...row,
		ip_address: row.ip_address ?? undefined,
		locale: row.locale ?? undefined,
		confirmed_at: row.confirmed_at ?? null,
		confirmed_by_steamid64: row.confirmed_by_steamid64 ?? null,
		answers: normalizeApplicationAnswers(row.answers)
	}));
}

export function getApplicationsByStatus(status: 'active' | 'archived' | 'all') {
	const db = getDb();
	const where =
		status === 'active'
			? 'WHERE confirmed_at IS NULL'
			: status === 'archived'
				? 'WHERE confirmed_at IS NOT NULL'
				: '';
	const orderBy = status === 'archived' ? 'ORDER BY confirmed_at DESC' : 'ORDER BY created_at DESC';
	const stmt = db.prepare(`
		SELECT id, user_id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
		FROM applications
		${where}
		${orderBy}
	`);
	const rows = stmt.all() as ApplicationRow[];
	return rows.map((row) => ({
		...row,
		ip_address: row.ip_address ?? undefined,
		locale: row.locale ?? undefined,
		confirmed_at: row.confirmed_at ?? null,
		confirmed_by_steamid64: row.confirmed_by_steamid64 ?? null,
		answers: normalizeApplicationAnswers(row.answers)
	}));
}

export function countApplicationsByStatus(status: 'active' | 'archived' | 'all') {
	const db = getDb();
	const where =
		status === 'active'
			? 'WHERE confirmed_at IS NULL'
			: status === 'archived'
				? 'WHERE confirmed_at IS NOT NULL'
				: '';
	const stmt = db.prepare(`
		SELECT COUNT(1) as count
		FROM applications
		${where}
	`);
	const row = stmt.get() as { count: number } | undefined;
	return row?.count ?? 0;
}

export function getByEmail(email: string) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT id, user_id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
		FROM applications
		WHERE email = ?
	`);

	const row = stmt.get(email) as ApplicationRow | undefined;
	if (!row) return null;
	return {
		...row,
		ip_address: row.ip_address ?? undefined,
		locale: row.locale ?? undefined,
		confirmed_at: row.confirmed_at ?? null,
		confirmed_by_steamid64: row.confirmed_by_steamid64 ?? null,
		answers: normalizeApplicationAnswers(row.answers)
	};
}

export function getBySteamId64(steamid64: string) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT id, user_id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
		FROM applications
		WHERE steamid64 = ?
	`);

	const row = stmt.get(steamid64) as ApplicationRow | undefined;
	if (!row) return null;
	return {
		...row,
		ip_address: row.ip_address ?? undefined,
		locale: row.locale ?? undefined,
		confirmed_at: row.confirmed_at ?? null,
		confirmed_by_steamid64: row.confirmed_by_steamid64 ?? null,
		answers: normalizeApplicationAnswers(row.answers)
	};
}

export function getByUserId(userId: number) {
	const db = getDb();
	const stmt = db.prepare(`
		SELECT id, user_id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
		FROM applications
		WHERE user_id = ?
		ORDER BY id ASC
		LIMIT 1
	`);

	const row = stmt.get(userId) as ApplicationRow | undefined;
	if (!row) return null;
	return {
		...row,
		ip_address: row.ip_address ?? undefined,
		locale: row.locale ?? undefined,
		confirmed_at: row.confirmed_at ?? null,
		confirmed_by_steamid64: row.confirmed_by_steamid64 ?? null,
		answers: normalizeApplicationAnswers(row.answers)
	};
}

export function deleteBySteamId64(steamid64: string) {
	const db = getDb();
	const stmt = db.prepare(`
		DELETE FROM applications
		WHERE steamid64 = ?
	`);

	try {
		const info = stmt.run(steamid64);
		return { success: true, changes: info.changes };
	} catch {
		return { success: false, error: 'database_error' };
	}
}
