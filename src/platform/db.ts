import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function resolveDbPath(): string {
	const override = process.env.DB_PATH;
	if (override && override.trim().length > 0) {
		return override.trim();
	}
	const dbDir = path.join(process.cwd(), 'database');
	return path.join(dbDir, 'applications.db');
}

let cachedDb: Database.Database | null = null;
let cachedDbPath: string | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

type Migration = {
	id: number;
	name: string;
	up: string;
};

const migrations: Migration[] = [
	{
		id: 1,
		name: 'initial_schema',
		up: `
			CREATE TABLE IF NOT EXISTS applications (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				steamid64 TEXT NOT NULL,
				persona_name TEXT,
				answers TEXT NOT NULL,
				ip_address TEXT,
				locale TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS steam_sessions (
				id TEXT PRIMARY KEY,
				redirect_path TEXT NOT NULL,
				steamid64 TEXT,
				persona_name TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
			CREATE INDEX IF NOT EXISTS idx_applications_steamid64 ON applications(steamid64);
			CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
			CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON steam_sessions(created_at);
		`
	},
	{
		id: 2,
		name: 'unique_steamid64',
		up: `
			-- Enforce one application per Steam account.
			-- If historical duplicates exist, keep the earliest submission and remove the rest.
			DELETE FROM applications
			WHERE id NOT IN (
				SELECT MIN(id)
				FROM applications
				GROUP BY steamid64
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_steamid64_unique
			ON applications(steamid64);
		`
	},
	{
		id: 3,
		name: 'answers_verified_game_access',
		up: `
			-- Migrate legacy Steam verification fields in answers JSON:
			-- - infer verified_game_access=true when legacy indicates verification
			-- - remove legacy keys (arma_reforger_owned, ownership_check)
			-- Guard with json_valid() to avoid failing if any corrupted rows exist.
			UPDATE applications
			SET answers = json_remove(
				CASE
					WHEN json_type(answers, '$.verified_game_access') IS NULL
						AND (
							json_extract(answers, '$.arma_reforger_owned') = 1
							OR json_extract(answers, '$.ownership_check') = 'verified'
						)
					THEN json_set(answers, '$.verified_game_access', 1)
					ELSE answers
				END,
				'$.arma_reforger_owned',
				'$.ownership_check'
			)
			WHERE json_valid(answers) = 1
				AND (
					json_type(answers, '$.arma_reforger_owned') IS NOT NULL
					OR json_type(answers, '$.ownership_check') IS NOT NULL
					OR json_type(answers, '$.verified_game_access') IS NOT NULL
				);
		`
	},
	{
		id: 4,
		name: 'users_identities_rename_requests_and_application_confirmation',
		up: `
			-- Add application confirmation metadata.
			ALTER TABLE applications ADD COLUMN confirmed_at DATETIME;
			ALTER TABLE applications ADD COLUMN confirmed_by_steamid64 TEXT;
			-- Link applications to stable users (internal integer id).
			ALTER TABLE applications ADD COLUMN user_id INTEGER;
			CREATE INDEX IF NOT EXISTS idx_applications_confirmed_at ON applications(confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);

			-- Users represent people in our system (stable user_id).
			-- Identities link external providers (Steam now, others later) to a user.
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				player_confirmed_at DATETIME,
				confirmed_application_id INTEGER,
				current_callsign TEXT,
				FOREIGN KEY (confirmed_application_id) REFERENCES applications(id)
			);
			CREATE INDEX IF NOT EXISTS idx_users_player_confirmed_at ON users(player_confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_users_current_callsign ON users(current_callsign);

			-- Active rename requirements live in a dedicated table.
			CREATE TABLE IF NOT EXISTS rename_requirements (
				user_id INTEGER PRIMARY KEY,
				required_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				required_by_steamid64 TEXT,
				reason TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_rename_requirements_required_at ON rename_requirements(required_at);

			CREATE TABLE IF NOT EXISTS user_identities (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				provider TEXT NOT NULL,
				provider_user_id TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE(provider, provider_user_id)
			);
			CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

			-- Backfill users for existing applications.
			-- We have a unique index on applications(steamid64), so each application maps 1:1 to a user.
			UPDATE applications
			SET user_id = COALESCE(user_id, id)
			WHERE user_id IS NULL;

			INSERT INTO users (id, current_callsign, created_at)
			SELECT
				a.user_id,
				CASE
					WHEN json_valid(a.answers) = 1
						AND json_type(a.answers, '$.callsign') IS NOT NULL
						AND TRIM(COALESCE(json_extract(a.answers, '$.callsign'), '')) != ''
					THEN TRIM(json_extract(a.answers, '$.callsign'))
					ELSE ('Steam_' || a.steamid64)
				END,
				a.created_at
			FROM applications a
			WHERE a.user_id IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);

			INSERT INTO user_identities (user_id, provider, provider_user_id, created_at)
			SELECT a.user_id, 'steam', a.steamid64, a.created_at
			FROM applications a
			WHERE a.user_id IS NOT NULL
				AND a.steamid64 IS NOT NULL
				AND a.steamid64 != ''
				AND NOT EXISTS (
					SELECT 1
					FROM user_identities ui
					WHERE ui.provider = 'steam' AND ui.provider_user_id = a.steamid64
				);

			-- Enforce one application per user.
			-- Production should already be safe (unique_steamid64), but keep this guard for any historical data.
			DELETE FROM applications
			WHERE user_id IS NOT NULL
				AND id NOT IN (
					SELECT MIN(id)
					FROM applications
					WHERE user_id IS NOT NULL
					GROUP BY user_id
				);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_id_unique
				ON applications(user_id)
				WHERE user_id IS NOT NULL;

			-- Rename requests are created by users when admins required a rename.
			CREATE TABLE IF NOT EXISTS rename_requests (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				old_callsign TEXT,
				new_callsign TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				decided_at DATETIME,
				decided_by_steamid64 TEXT,
				decline_reason TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id)
			);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_user_id ON rename_requests(user_id);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_status ON rename_requests(status);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_created_at ON rename_requests(created_at);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_rename_requests_pending_unique
				ON rename_requests(user_id)
				WHERE status = 'pending';

			-- Callsign uniqueness should be enforced on the canonical field: users.current_callsign.
			UPDATE users
			SET current_callsign = TRIM(current_callsign)
			WHERE current_callsign IS NOT NULL;

			-- Ensure every user has a stable, valid callsign. Use Steam_<steamid64> as fallback.
			UPDATE users
			SET current_callsign = (
				'Steam_' || (
					SELECT ui.provider_user_id
					FROM user_identities ui
					WHERE ui.user_id = users.id AND ui.provider = 'steam'
					LIMIT 1
				)
			)
			WHERE current_callsign IS NULL OR TRIM(current_callsign) = '';

			-- If duplicates exist, keep the lowest user id as canonical and set the rest to Steam_<steamid64>.
			UPDATE users
			SET current_callsign = (
				'Steam_' || (
					SELECT ui.provider_user_id
					FROM user_identities ui
					WHERE ui.user_id = users.id AND ui.provider = 'steam'
					LIMIT 1
				)
			)
			WHERE current_callsign IS NOT NULL
				AND TRIM(current_callsign) != ''
				AND id NOT IN (
					SELECT MIN(id)
					FROM users
					WHERE current_callsign IS NOT NULL AND TRIM(current_callsign) != ''
					GROUP BY LOWER(current_callsign)
				);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_callsign_unique
				ON users(LOWER(current_callsign))
				WHERE current_callsign IS NOT NULL AND TRIM(current_callsign) != '';
		`
	}
];

function ensureMigrationsTable(db: Database.Database) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`);
}

function applyMigrations(db: Database.Database) {
	ensureMigrationsTable(db);

	const ordered = [...migrations].sort((a, b) => a.id - b.id);
	const ids = new Set<number>();
	for (const m of ordered) {
		if (ids.has(m.id)) {
			throw new Error(`Duplicate migration id: ${m.id}`);
		}
		ids.add(m.id);
	}

	const run = db.transaction(() => {
		const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?');
		const insertMigration = db.prepare(
			'INSERT INTO schema_migrations (id, name) VALUES (?, ?)'
		);

		for (const migration of ordered) {
			const alreadyApplied = !!hasMigration.get(migration.id);
			if (alreadyApplied) continue;

			db.exec(migration.up);
			insertMigration.run(migration.id, migration.name);
		}
	});

	run();
}

function initializeDatabase(dbPath: string): Database.Database {
	// Ensure database directory exists (skip for in-memory DB).
	if (dbPath !== ':memory:') {
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	const db = new Database(dbPath);

	// Enable WAL mode for better concurrency
	db.pragma('journal_mode = WAL');

	// Safer defaults.
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');

	applyMigrations(db);
	return db;
}

export function getDb(): Database.Database {
	const dbPath = resolveDbPath();
	if (cachedDb && cachedDbPath === dbPath) return cachedDb;

	if (cachedDb) {
		try {
			cachedDb.close();
		} catch {
			// ignore
		}
	}

	cachedDb = initializeDatabase(dbPath);
	cachedDbPath = dbPath;
	return cachedDb;
}

export interface Application {
	id?: number;
	user_id?: number | null;
	email: string;
	steamid64: string;
	persona_name?: string | null;
	answers: {
		callsign: string;
		/** Optional real name (new). */
		name?: string;
		age: string;
		city: string;
		country: string;
		availability: string;
		timezone: string;
		experience: string;
		motivation: string;
		verified_game_access?: boolean;
	};
	ip_address?: string;
	locale?: string;
	created_at?: string;
	confirmed_at?: string | null;
	confirmed_by_steamid64?: string | null;
}

export interface User {
	id: number;
	created_at?: string;
	player_confirmed_at?: string | null;
	confirmed_application_id?: number | null;
	current_callsign?: string | null;
	rename_required_at?: string | null;
	rename_required_reason?: string | null;
	rename_required_by_steamid64?: string | null;
}

export interface SteamSession {
	id: string;
	redirect_path: string;
	steamid64?: string | null;
	persona_name?: string | null;
	created_at?: string;
}

type SteamSessionRow = {
	id: string;
	redirect_path: string;
	steamid64: string | null;
	persona_name: string | null;
	created_at: string;
};

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

type UserRow = {
	id: number;
	created_at: string;
	player_confirmed_at: string | null;
	confirmed_application_id: number | null;
	current_callsign: string | null;
	rename_required_at: string | null;
	rename_required_reason: string | null;
	rename_required_by_steamid64: string | null;
};

function normalizeApplicationAnswers(raw: string): Application['answers'] {
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

export const dbOperations = {
	getOrCreateUserBySteamId64: (input: { steamid64: string }) => {
		const db = getDb();
		const steamid64 = input.steamid64.trim();
		const fallbackCallsign = `Steam_${steamid64}`;
		const select = db.prepare(`
			SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
				u.current_callsign,
				rr.required_at as rename_required_at,
				rr.reason as rename_required_reason,
				rr.required_by_steamid64 as rename_required_by_steamid64
			FROM user_identities ui
			JOIN users u ON u.id = ui.user_id
			LEFT JOIN rename_requirements rr ON rr.user_id = u.id
			WHERE ui.provider = 'steam' AND ui.provider_user_id = ?
		`);
		const insertUser = db.prepare(`
			INSERT INTO users (current_callsign)
			VALUES (?)
		`);
		const insertIdentity = db.prepare(`
			INSERT INTO user_identities (user_id, provider, provider_user_id)
			VALUES (?, 'steam', ?)
		`);

		try {
			const run = db.transaction(() => {
				const existing = select.get(steamid64) as UserRow | undefined;
				if (existing) {
					return existing;
				}

				const info = insertUser.run(fallbackCallsign);
				const userIdRaw = info.lastInsertRowid;
				const userId = typeof userIdRaw === 'bigint' ? Number(userIdRaw) : (userIdRaw as number);
				insertIdentity.run(userId, steamid64);
				const created = select.get(steamid64) as UserRow | undefined;
				if (!created) throw new Error('user_create_failed');
				return created;
			});
			return { success: true as const, user: run() as User };
		} catch {
			return { success: false as const, error: 'database_error' as const };
		}
	},

	createSteamSession: (session: { id: string; redirect_path: string }) => {
		const db = getDb();
		const stmt = db.prepare(`
			INSERT INTO steam_sessions (id, redirect_path)
			VALUES (?, ?)
		`);

		try {
			stmt.run(session.id, session.redirect_path);
			return { success: true };
		} catch {
			return { success: false, error: 'database_error' };
		}
	},

	setSteamSessionIdentity: (
		sessionId: string,
		identity: { steamid64: string; persona_name?: string | null }
	) => {
		const db = getDb();
		const stmt = db.prepare(`
			UPDATE steam_sessions
			SET steamid64 = ?, persona_name = ?
			WHERE id = ?
		`);

		try {
			const info = stmt.run(identity.steamid64, identity.persona_name ?? null, sessionId);
			return { success: info.changes > 0 };
		} catch {
			return { success: false, error: 'database_error' };
		}
	},

	getSteamSession: (sessionId: string): SteamSession | null => {
		const db = getDb();
		const stmt = db.prepare(`
			SELECT id, redirect_path, steamid64, persona_name, created_at
			FROM steam_sessions
			WHERE id = ?
		`);

		const row = stmt.get(sessionId) as SteamSessionRow | undefined;
		if (!row) return null;
		return row;
	},

	deleteSteamSession: (sessionId: string) => {
		const db = getDb();
		const stmt = db.prepare(`
			DELETE FROM steam_sessions
			WHERE id = ?
		`);

		try {
			stmt.run(sessionId);
			return { success: true };
		} catch {
			return { success: false, error: 'database_error' };
		}
	},

	insertApplication: (
		application: Omit<Application, 'id' | 'created_at'>
	):
		| { success: true; id: unknown }
		| { success: false; error: 'duplicate' | 'constraint_error' | 'database_error' } => {
		const db = getDb();
		const ensured = dbOperations.getOrCreateUserBySteamId64({
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
	},

	getAllApplications: () => {
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
	},

	getApplicationsByStatus: (status: 'active' | 'archived' | 'all') => {
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
	},

	countApplicationsByStatus: (status: 'active' | 'archived' | 'all') => {
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
	},

	getByEmail: (email: string) => {
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
	},

	getBySteamId64: (steamid64: string) => {
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
	},

	getByUserId: (userId: number) => {
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
	},

	listCallsigns: (scope?: { includeActive?: boolean; includeConfirmed?: boolean }) => {
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
	},

	upsertUser: (user: { steamid64: string }) => {
		const result = dbOperations.getOrCreateUserBySteamId64({ steamid64: user.steamid64 });
		if (!result.success) return { success: false as const, error: 'database_error' as const };
		return { success: true as const, userId: result.user.id };
	},

	getUserBySteamId64: (steamid64: string): User | null => {
		const db = getDb();
		const stmt = db.prepare(`
			SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
				u.current_callsign,
				rr.required_at as rename_required_at,
				rr.reason as rename_required_reason,
				rr.required_by_steamid64 as rename_required_by_steamid64
			FROM user_identities ui
			JOIN users u ON u.id = ui.user_id
			LEFT JOIN rename_requirements rr ON rr.user_id = u.id
			WHERE ui.provider = 'steam' AND ui.provider_user_id = ?
		`);

		const row = stmt.get(steamid64) as UserRow | undefined;
		if (!row) return null;
		return row;
	},

	setUserRenameRequiredBySteamId64: (input: {
		steamid64: string;
		requestedBySteamId64: string;
		reason?: string | null;
	}) => {
		const db = getDb();
		try {
			const run = db.transaction(() => {
				const ensured = dbOperations.getOrCreateUserBySteamId64({
					steamid64: input.steamid64
				});
				if (!ensured.success) return { success: false as const, error: 'database_error' as const };

				// Best-effort: seed current_callsign from application if missing.
				const app = dbOperations.getBySteamId64(input.steamid64);
				if (app?.answers?.callsign) {
					const setCallsign = db.prepare(`
						UPDATE users
						SET current_callsign = CASE
							WHEN current_callsign IS NULL OR TRIM(current_callsign) = '' OR current_callsign = ?
							THEN ?
							ELSE current_callsign
						END
						WHERE id = ?
					`);
					setCallsign.run(`Steam_${input.steamid64.trim()}`, app.answers.callsign, ensured.user.id);
				}

				const insert = db.prepare(`
					INSERT INTO rename_requirements (user_id, required_by_steamid64, reason)
					VALUES (?, ?, ?)
					ON CONFLICT(user_id) DO NOTHING
				`);
				const info = insert.run(
					ensured.user.id,
					input.requestedBySteamId64,
					input.reason ?? null
				);
				return { success: info.changes > 0 };
			});
			return run();
		} catch {
			return { success: false, error: 'database_error' as const };
		}
	},

	clearUserRenameRequiredByUserId: (userId: number) => {
		const db = getDb();
		const stmt = db.prepare(`
			DELETE FROM rename_requirements
			WHERE user_id = ?
		`);

		try {
			const info = stmt.run(userId);
			return { success: info.changes > 0 };
		} catch {
			return { success: false, error: 'database_error' as const };
		}
	},

	clearUserRenameRequiredBySteamId64: (steamid64: string) => {
		const user = dbOperations.getUserBySteamId64(steamid64);
		if (!user) return { success: false, error: 'not_found' as const };
		return dbOperations.clearUserRenameRequiredByUserId(user.id);
	},

	hasPendingRenameRequestByUserId: (userId: number) => {
		const db = getDb();
		const stmt = db.prepare(`
			SELECT 1
			FROM rename_requests
			WHERE user_id = ? AND status = 'pending'
			LIMIT 1
		`);
		return !!stmt.get(userId);
	},

	getLatestDeclineReasonByUserId: (userId: number) => {
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
	},

	createRenameRequest: (input: { userId: number; newCallsign: string }) => {
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
	},

	listUsers: (status: 'all' | 'rename_required' | 'confirmed') => {
		const db = getDb();
		const where =
			status === 'rename_required'
				? 'WHERE rrq.user_id IS NOT NULL'
				: status === 'confirmed'
					? 'WHERE u.player_confirmed_at IS NOT NULL'
					: '';
		const stmt = db.prepare(`
			SELECT u.id, u.created_at, u.player_confirmed_at, u.confirmed_application_id,
				u.current_callsign,
				rrq.required_at as rename_required_at,
				rrq.reason as rename_required_reason,
				rrq.required_by_steamid64 as rename_required_by_steamid64,
				EXISTS(
					SELECT 1
					FROM rename_requests rr
					WHERE rr.user_id = u.id AND rr.status = 'pending'
				) as has_pending_rename_request,
				ui.provider_user_id as steamid64
			FROM users u
			LEFT JOIN user_identities ui
				ON ui.user_id = u.id AND ui.provider = 'steam'
			LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
			${where}
			ORDER BY u.created_at DESC
		`);
		return stmt.all() as Array<Record<string, unknown>>;
	},

	countUsersByStatus: (status: 'all' | 'rename_required' | 'confirmed') => {
		const db = getDb();
		const where =
			status === 'rename_required'
				? `WHERE EXISTS (
					SELECT 1 FROM rename_requirements rrq WHERE rrq.user_id = users.id
				)`
				: status === 'confirmed'
					? 'WHERE player_confirmed_at IS NOT NULL'
					: '';
		const stmt = db.prepare(`
			SELECT COUNT(1) as count
			FROM users
			${where}
		`);
		const row = stmt.get() as { count: number } | undefined;
		return row?.count ?? 0;
	},

	listRenameRequests: (status: 'pending' | 'approved' | 'declined' | 'all') => {
		const db = getDb();
		const where = status === 'all' ? '' : 'WHERE rr.status = ?';
		const stmt = db.prepare(`
			SELECT rr.id, rr.user_id, rr.old_callsign, rr.new_callsign, rr.status,
				rr.created_at, rr.decided_at, rr.decided_by_steamid64, rr.decline_reason,
				u.current_callsign, rrq.required_at as rename_required_at,
				ui.provider_user_id as steamid64
			FROM rename_requests rr
			JOIN users u ON u.id = rr.user_id
			LEFT JOIN user_identities ui
				ON ui.user_id = u.id AND ui.provider = 'steam'
			LEFT JOIN rename_requirements rrq ON rrq.user_id = u.id
			${where}
			ORDER BY rr.created_at DESC
		`);
		const rows =
			status === 'all'
				? (stmt.all() as Array<Record<string, unknown>>)
				: (stmt.all(status) as Array<Record<string, unknown>>);
		return rows;
	},

	decideRenameRequest: (input: {
		requestId: number;
		decision: 'approve' | 'decline';
		decidedBySteamId64: string;
		declineReason?: string | null;
	}) => {
		const db = getDb();
		const select = db.prepare(`
			SELECT id, user_id, new_callsign, status
			FROM rename_requests
			WHERE id = ?
		`);
		const mark = db.prepare(`
			UPDATE rename_requests
			SET status = ?,
				decided_at = CURRENT_TIMESTAMP,
				decided_by_steamid64 = ?,
				decline_reason = ?
			WHERE id = ?
		`);
		const setCallsign = db.prepare(`
			UPDATE users
			SET current_callsign = ?
			WHERE id = ?
		`);
		const clearRenameRequired = db.prepare(`
			DELETE FROM rename_requirements
			WHERE user_id = ?
		`);
		const ensureBlocked = db.prepare(`
			INSERT INTO rename_requirements (user_id, required_by_steamid64)
			VALUES (?, ?)
			ON CONFLICT(user_id) DO NOTHING
		`);

		try {
			const run = db.transaction(() => {
				const row = select.get(input.requestId) as
					| { id: number; user_id: number; new_callsign: string; status: string }
					| undefined;
				if (!row) return { success: false as const, error: 'not_found' as const };
				if (row.status !== 'pending') return { success: false as const, error: 'not_pending' as const };

				if (input.decision === 'approve') {
					setCallsign.run(row.new_callsign, row.user_id);
					mark.run('approved', input.decidedBySteamId64, null, row.id);
					clearRenameRequired.run(row.user_id);
					return { success: true as const };
				}

				mark.run('declined', input.decidedBySteamId64, input.declineReason ?? null, row.id);
				ensureBlocked.run(row.user_id, input.decidedBySteamId64);
				return { success: true as const };
			});
			return run();
		} catch {
			return { success: false as const, error: 'database_error' as const };
		}
	},

	confirmApplication: (applicationId: number, confirmedBySteamId64: string) => {
		const db = getDb();
		const selectApp = db.prepare(`
			SELECT id, steamid64, persona_name, answers
			FROM applications
			WHERE id = ?
		`);
		const updateApp = db.prepare(`
			UPDATE applications
			SET confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP),
				confirmed_by_steamid64 = COALESCE(confirmed_by_steamid64, ?),
				user_id = COALESCE(user_id, ?)
			WHERE id = ?
		`);
		const updateUser = db.prepare(`
			UPDATE users
			SET player_confirmed_at = COALESCE(player_confirmed_at, CURRENT_TIMESTAMP),
				confirmed_application_id = COALESCE(confirmed_application_id, ?)
			WHERE id = ?
		`);
		const seedUserCallsign = db.prepare(`
			UPDATE users
			SET current_callsign = CASE
				WHEN current_callsign IS NULL OR TRIM(current_callsign) = '' OR current_callsign = ?
				THEN ?
				ELSE current_callsign
			END
			WHERE id = ?
		`);

		try {
			const run = db.transaction(() => {
				const row = selectApp.get(applicationId) as
					| { id: number; steamid64: string; persona_name: string | null; answers: string }
					| undefined;
				if (!row) return { success: false as const, error: 'not_found' as const };

				const ensured = dbOperations.getOrCreateUserBySteamId64({
					steamid64: row.steamid64
				});
				if (!ensured.success) return { success: false as const, error: 'database_error' as const };

				// Seed callsign from application if missing.
				const answers = normalizeApplicationAnswers(row.answers);
				if (answers.callsign) {
					seedUserCallsign.run(`Steam_${row.steamid64.trim()}`, answers.callsign, ensured.user.id);
				}

				updateApp.run(confirmedBySteamId64, ensured.user.id, applicationId);
				updateUser.run(applicationId, ensured.user.id);
				return { success: true as const };
			});

			return run();
		} catch {
			return { success: false as const, error: 'database_error' as const };
		}
	},

	deleteBySteamId64: (steamid64: string) => {
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
	},

	clearAll: () => {
		const db = getDb();
		try {
			db.exec(
				'DELETE FROM rename_requests; DELETE FROM user_identities; DELETE FROM applications; DELETE FROM steam_sessions; DELETE FROM users;'
			);
			return { success: true };
		} catch {
			return { success: false, error: 'database_error' };
		}
	}
};

export default getDb;
