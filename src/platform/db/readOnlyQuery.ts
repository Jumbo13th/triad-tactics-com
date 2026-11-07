import Database from 'better-sqlite3';
import { getDb, resolveDbPath } from './connection';

export type ReadOnlyQueryInput = {
	sql: string;
	params: readonly unknown[];
	maxRows: number;
	deniedTables: readonly string[];
};

export type ReadOnlyQueryResult =
	| { ok: true; columns: string[]; rows: unknown[][]; truncated: boolean }
	| { ok: false; error: 'invalid_sql' | 'not_a_query' | 'denied_table'; message: string };

export type SchemaObject = { type: string; name: string; sql: string | null };

let cachedReader: Database.Database | null = null;
let cachedReaderPath: string | null = null;

function getReader(): Database.Database {
	// The writer connection runs migrations and creates the file; a read-only
	// handle cannot do either.
	getDb();
	const dbPath = resolveDbPath();
	if (cachedReader && cachedReaderPath === dbPath) return cachedReader;

	if (cachedReader) {
		try {
			cachedReader.close();
		} catch {
			// ignore
		}
	}

	const reader = new Database(dbPath, { readonly: true, fileMustExist: true });
	reader.pragma('query_only = ON');
	reader.pragma('busy_timeout = 5000');
	cachedReader = reader;
	cachedReaderPath = dbPath;
	return reader;
}

function deniedRootPages(db: Database.Database, tables: readonly string[]): Map<number, string> {
	if (tables.length === 0) return new Map();
	const placeholders = tables.map(() => '?').join(', ');
	const rows = db
		.prepare(`SELECT tbl_name, rootpage FROM sqlite_schema WHERE tbl_name IN (${placeholders}) AND rootpage > 0`)
		.all(...tables) as Array<{ tbl_name: string; rootpage: number }>;
	return new Map(rows.map((row) => [row.rootpage, row.tbl_name]));
}

// Checked on the compiled program rather than the SQL text: views, CTEs, quoting
// and index-only scans all still open a cursor on the table's or index's root page.
function findDeniedTable(
	db: Database.Database,
	sql: string,
	params: readonly unknown[],
	denied: Map<number, string>
): string | null {
	if (denied.size === 0) return null;
	const program = db.prepare(`EXPLAIN ${sql}`).all(...params) as Array<{ opcode: string; p2: number }>;
	for (const op of program) {
		if (op.opcode !== 'OpenRead' && op.opcode !== 'ReopenIdx' && op.opcode !== 'OpenWrite') continue;
		const table = denied.get(op.p2);
		if (table) return table;
	}
	return null;
}

function normalizeCell(value: unknown): unknown {
	if (Buffer.isBuffer(value)) return `[blob ${value.length} bytes]`;
	if (typeof value === 'bigint') return value.toString();
	return value;
}

export function runReadOnlyQuery(input: ReadOnlyQueryInput): ReadOnlyQueryResult {
	const db = getReader();

	let stmt: Database.Statement;
	try {
		stmt = db.prepare(input.sql);
	} catch (error) {
		return { ok: false, error: 'invalid_sql', message: error instanceof Error ? error.message : String(error) };
	}

	if (!stmt.reader) {
		return { ok: false, error: 'not_a_query', message: 'Only statements that return rows (SELECT, WITH, read PRAGMAs) are allowed.' };
	}

	try {
		const deniedTable = findDeniedTable(db, input.sql, input.params, deniedRootPages(db, input.deniedTables));
		if (deniedTable) {
			return { ok: false, error: 'denied_table', message: `Table "${deniedTable}" holds credentials and cannot be read.` };
		}

		stmt.raw(true);
		const columns = stmt.columns().map((column) => column.name);
		const rows: unknown[][] = [];
		let truncated = false;
		for (const row of stmt.iterate(...input.params) as Iterable<unknown[]>) {
			if (rows.length >= input.maxRows) {
				truncated = true;
				break;
			}
			rows.push(row.map(normalizeCell));
		}
		return { ok: true, columns, rows, truncated };
	} catch (error) {
		return { ok: false, error: 'invalid_sql', message: error instanceof Error ? error.message : String(error) };
	}
}

export function listSchemaObjects(): SchemaObject[] {
	return getReader()
		.prepare(
			"SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table', 'view', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, type DESC, name"
		)
		.all() as SchemaObject[];
}
