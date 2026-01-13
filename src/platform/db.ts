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
		name: 'users_and_application_confirmation',
		up: `
			-- Users represent Steam identities known to our system.
			CREATE TABLE IF NOT EXISTS users (
				steamid64 TEXT PRIMARY KEY,
				persona_name TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				player_confirmed_at DATETIME,
				confirmed_application_id INTEGER,
				FOREIGN KEY (confirmed_application_id) REFERENCES applications(id)
			);

			-- Add application confirmation metadata.
			ALTER TABLE applications ADD COLUMN confirmed_at DATETIME;
			ALTER TABLE applications ADD COLUMN confirmed_by_steamid64 TEXT;

			CREATE INDEX IF NOT EXISTS idx_users_player_confirmed_at ON users(player_confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_applications_confirmed_at ON applications(confirmed_at);

			-- Backfill users for existing applications (migration).
			INSERT OR IGNORE INTO users (steamid64, persona_name, created_at)
			SELECT steamid64, persona_name, created_at
			FROM applications;
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
	email: string;
	steamid64: string;
	persona_name?: string | null;
	answers: {
		name: string;
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
	steamid64: string;
	persona_name?: string | null;
	created_at?: string;
	player_confirmed_at?: string | null;
	confirmed_application_id?: number | null;
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
	steamid64: string;
	persona_name: string | null;
	created_at: string;
	player_confirmed_at: string | null;
	confirmed_application_id: number | null;
};

export const dbOperations = {
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
		const stmt = db.prepare(`
			INSERT INTO applications (email, steamid64, persona_name, answers, ip_address, locale)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		try {
			const info = stmt.run(
				application.email,
				application.steamid64,
				application.persona_name ?? null,
				JSON.stringify(application.answers),
				application.ip_address || null,
				application.locale || 'en'
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
			SELECT id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
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
			answers: JSON.parse(row.answers) as Application['answers']
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
			SELECT id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
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
			answers: JSON.parse(row.answers) as Application['answers']
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
			SELECT id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
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
			answers: JSON.parse(row.answers) as Application['answers']
		};
	},

	getBySteamId64: (steamid64: string) => {
		const db = getDb();
		const stmt = db.prepare(`
			SELECT id, email, steamid64, persona_name, answers, ip_address, locale, created_at, confirmed_at, confirmed_by_steamid64
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
			answers: JSON.parse(row.answers) as Application['answers']
		};
	},

	upsertUser: (user: { steamid64: string; persona_name?: string | null }) => {
		const db = getDb();
		const insert = db.prepare(`
			INSERT OR IGNORE INTO users (steamid64, persona_name)
			VALUES (?, ?)
		`);
		const update = db.prepare(`
			UPDATE users
			SET persona_name = COALESCE(?, persona_name)
			WHERE steamid64 = ?
		`);

		try {
			const run = db.transaction(() => {
				insert.run(user.steamid64, user.persona_name ?? null);
				update.run(user.persona_name ?? null, user.steamid64);
			});
			run();
			return { success: true as const };
		} catch {
			return { success: false as const, error: 'database_error' as const };
		}
	},

	getUserBySteamId64: (steamid64: string): User | null => {
		const db = getDb();
		const stmt = db.prepare(`
			SELECT steamid64, persona_name, created_at, player_confirmed_at, confirmed_application_id
			FROM users
			WHERE steamid64 = ?
		`);

		const row = stmt.get(steamid64) as UserRow | undefined;
		if (!row) return null;
		return row;
	},

	confirmApplication: (applicationId: number, confirmedBySteamId64: string) => {
		const db = getDb();
		const selectApp = db.prepare(`
			SELECT id, steamid64, persona_name
			FROM applications
			WHERE id = ?
		`);
		const updateApp = db.prepare(`
			UPDATE applications
			SET confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP),
				confirmed_by_steamid64 = COALESCE(confirmed_by_steamid64, ?)
			WHERE id = ?
		`);
		const ensureUser = db.prepare(`
			INSERT OR IGNORE INTO users (steamid64, persona_name)
			VALUES (?, ?)
		`);
		const updateUser = db.prepare(`
			UPDATE users
			SET player_confirmed_at = COALESCE(player_confirmed_at, CURRENT_TIMESTAMP),
				confirmed_application_id = COALESCE(confirmed_application_id, ?)
			WHERE steamid64 = ?
		`);

		try {
			const run = db.transaction(() => {
				const row = selectApp.get(applicationId) as
					| { id: number; steamid64: string; persona_name: string | null }
					| undefined;
				if (!row) return { success: false as const, error: 'not_found' as const };

				updateApp.run(confirmedBySteamId64, applicationId);
				ensureUser.run(row.steamid64, row.persona_name);
				updateUser.run(applicationId, row.steamid64);
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
			db.exec('DELETE FROM applications; DELETE FROM steam_sessions; DELETE FROM users;');
			return { success: true };
		} catch {
			return { success: false, error: 'database_error' };
		}
	}
};

export default getDb;


