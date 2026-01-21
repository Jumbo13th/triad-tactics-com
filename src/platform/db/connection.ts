import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { migrations } from './migrations';

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
