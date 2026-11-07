import { z } from 'zod';
import { defineTool, errorResult, jsonResult, type AdminTool } from './defineTool';
import { MCP_SQL_DENIED_TABLES } from '@/features/adminMcp/domain/types';
import { listSchemaObjects, runReadOnlyQuery } from '@/platform/db/readOnlyQuery';

const DEFAULT_MAX_ROWS = 200;
const deniedList = MCP_SQL_DENIED_TABLES.join(', ');

export const databaseTools: AdminTool[] = [
	defineTool({
		name: 'whoami',
		title: 'Who am I',
		description: 'Returns the admin this MCP connection acts as (SteamID64) and the access token in use. Every change made through these tools is recorded under that SteamID64.',
		annotations: { readOnlyHint: true },
		input: z.object({}),
		run: (_args, ctx) =>
			jsonResult({ steamid64: ctx.principal.steamid64, tokenId: ctx.principal.tokenId, tokenLabel: ctx.principal.label })
	}),
	defineTool({
		name: 'db_schema',
		title: 'Database schema',
		description: `Lists every table, view and index in the site's SQLite database with its CREATE statement. Use it before db_query. Tables ${deniedList} hold credentials and cannot be queried.`,
		annotations: { readOnlyHint: true },
		input: z.object({}),
		run: () => jsonResult(listSchemaObjects())
	}),
	defineTool({
		name: 'db_query',
		title: 'Read-only SQL query',
		description: `Runs one read-only SQLite statement (SELECT, WITH or a reading PRAGMA) against the live database and returns column names and rows. Writes are impossible: the connection is read-only. Tables ${deniedList} are refused. The query runs on the site's own process, so keep it bounded (LIMIT, indexed filters). Prefer the dedicated tools for changes; this is for questions the panel cannot answer.`,
		annotations: { readOnlyHint: true },
		input: z.object({
			sql: z.string().min(1).describe('A single SQLite statement. Use ? placeholders for values.'),
			params: z
				.array(z.union([z.string(), z.number(), z.null()]))
				.optional()
				.describe('Values bound to the ? placeholders, in order.'),
			maxRows: z
				.number()
				.int()
				.min(1)
				.max(1000)
				.optional()
				.describe(`Rows to return before truncating; default ${DEFAULT_MAX_ROWS}.`)
		}),
		run: (args) => {
			const result = runReadOnlyQuery({
				sql: args.sql,
				params: args.params ?? [],
				maxRows: args.maxRows ?? DEFAULT_MAX_ROWS,
				deniedTables: MCP_SQL_DENIED_TABLES
			});
			if (!result.ok) return errorResult(`${result.error}: ${result.message}`);
			return jsonResult({
				columns: result.columns,
				rows: result.rows,
				rowCount: result.rows.length,
				truncated: result.truncated
			});
		}
	})
];
