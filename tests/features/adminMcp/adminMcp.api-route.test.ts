import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../fixtures/isolatedDb';
import { createSteamSession } from '../../fixtures/steamSession';

const ADMIN_STEAM_ID = '76561198012345678';
const OTHER_STEAM_ID = '76561198000000000';
const LEGACY_VERSION = '2025-06-18';
const MODERN_VERSION = '2026-07-28';

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };

async function loadHarness() {
	const { dbOperations, getDb } = await import('../../fixtures/dbOperations');
	const tokensRoute = await import('@/app/api/admin/mcp-tokens/route');
	const revokeRoute = await import('@/app/api/admin/mcp-tokens/[tokenId]/revoke/route');
	const mcpRoute = await import('@/app/api/mcp/route');
	const { NextRequest } = await import('next/server');
	return { dbOperations, getDb, tokensRoute, revokeRoute, mcpRoute, NextRequest };
}

async function adminRequest(path: string, init: { method?: string; body?: unknown; steamid64?: string } = {}) {
	const { dbOperations, NextRequest } = await loadHarness();
	const sid = createSteamSession(dbOperations, { steamid64: init.steamid64 ?? ADMIN_STEAM_ID });
	return new NextRequest(`http://localhost${path}`, {
		method: init.method ?? 'GET',
		headers: {
			cookie: `tt_steam_session=${sid}`,
			origin: 'http://localhost',
			'content-type': 'application/json'
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body)
	});
}

async function issueToken(label = 'test'): Promise<{ token: string; id: number }> {
	const { tokensRoute } = await loadHarness();
	const res = await tokensRoute.POST(
		await adminRequest('/api/admin/mcp-tokens', { method: 'POST', body: { label, expiresInDays: 30 } })
	);
	expect(res.status).toBe(200);
	const json = await res.json();
	return { token: json.token, id: json.summary.id };
}

async function postMcp(body: unknown, headers: Record<string, string>) {
	const { mcpRoute, NextRequest } = await loadHarness();
	return mcpRoute.POST(
		new NextRequest('http://localhost/api/mcp', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
			body: JSON.stringify(body)
		})
	);
}

async function readRpcResult(res: Response): Promise<Record<string, unknown>> {
	const text = await res.text();
	const payload = (res.headers.get('content-type') ?? '').includes('text/event-stream')
		? text
				.split('\n')
				.find((line) => line.startsWith('data: '))!
				.slice('data: '.length)
		: text;
	return (JSON.parse(payload) as { result: Record<string, unknown> }).result;
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
	const res = await postMcp(
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		{ authorization: `Bearer ${token}`, 'mcp-protocol-version': LEGACY_VERSION }
	);
	expect(res.status).toBe(200);
	return (await readRpcResult(res)) as unknown as ToolResult;
}

function toolText(result: ToolResult): string {
	return result.content.map((block) => block.text ?? '').join('');
}

describe('Admin MCP', () => {
	beforeAll(async () => {
		await setupIsolatedDb({ prefix: 'triad-tactics-admin-mcp', adminSteamIds: ADMIN_STEAM_ID });
	});

	beforeEach(async () => {
		process.env.ADMIN_STEAM_IDS = ADMIN_STEAM_ID;
		const { dbOperations } = await loadHarness();
		dbOperations.clearAll();
	});

	describe('token management', () => {
		it('shows a new token once and lists it by its hint only', async () => {
			const { tokensRoute } = await loadHarness();
			const { token } = await issueToken('laptop');
			expect(token).toMatch(/^ttmcp_[A-Za-z0-9_-]{43}$/);

			const res = await tokensRoute.GET(await adminRequest('/api/admin/mcp-tokens'));
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.tokens).toHaveLength(1);
			expect(json.tokens[0]).toMatchObject({ label: 'laptop', hint: token.slice(0, 12), state: 'active' });
			expect(JSON.stringify(json)).not.toContain(token);
		});

		it('refuses non-admins', async () => {
			const { tokensRoute } = await loadHarness();
			const res = await tokensRoute.POST(
				await adminRequest('/api/admin/mcp-tokens', {
					method: 'POST',
					body: { label: 'x', expiresInDays: 30 },
					steamid64: OTHER_STEAM_ID
				})
			);
			expect(res.status).toBe(403);
		});

		it('cannot be reached with a token-delegated identity', async () => {
			const { NextRequest } = await loadHarness();
			const { actAsAdmin } = await import('@/features/admin/adapters/next/adminAuth');
			const { getAdminMcpTokensRoute } = await import('@/features/adminMcp/adapters/next/tokensRoute');
			const request = new NextRequest('http://localhost/api/admin/mcp-tokens');
			actAsAdmin(request, ADMIN_STEAM_ID);
			const res = await getAdminMcpTokensRoute(request);
			expect(res.status).toBe(403);
			expect((await res.json()).error).toBe('session_required');
		});
	});

	describe('endpoint authentication', () => {
		const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };

		it('answers 401 with a Bearer challenge without a token', async () => {
			const res = await postMcp(ping, {});
			expect(res.status).toBe(401);
			expect(res.headers.get('www-authenticate')).toContain('Bearer');
		});

		it('rejects an unknown token', async () => {
			const res = await postMcp(ping, { authorization: `Bearer ttmcp_${'A'.repeat(43)}` });
			expect(res.status).toBe(401);
		});

		it('rejects a revoked token', async () => {
			const { revokeRoute } = await loadHarness();
			const { token, id } = await issueToken();
			const revoke = await revokeRoute.POST(
				await adminRequest(`/api/admin/mcp-tokens/${id}/revoke`, { method: 'POST' }),
				{ params: Promise.resolve({ tokenId: String(id) }) }
			);
			expect(revoke.status).toBe(200);
			expect((await postMcp(ping, { authorization: `Bearer ${token}` })).status).toBe(401);
		});

		it('rejects an expired token', async () => {
			const { getDb } = await loadHarness();
			const { token, id } = await issueToken();
			getDb().prepare("UPDATE admin_mcp_tokens SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(id);
			expect((await postMcp(ping, { authorization: `Bearer ${token}` })).status).toBe(401);
		});

		it('stops a token as soon as its owner leaves the admin list', async () => {
			const { token } = await issueToken();
			process.env.ADMIN_STEAM_IDS = `${OTHER_STEAM_ID}`;
			expect((await postMcp(ping, { authorization: `Bearer ${token}` })).status).toBe(403);
		});

		it('refuses requests from a foreign web origin', async () => {
			const { token } = await issueToken();
			const res = await postMcp(ping, { authorization: `Bearer ${token}`, origin: 'https://evil.example' });
			expect(res.status).toBe(403);
		});

		it('records when a token was last used', async () => {
			const { getDb } = await loadHarness();
			const { token, id } = await issueToken();
			await callTool(token, 'whoami');
			const row = getDb().prepare('SELECT last_used_at FROM admin_mcp_tokens WHERE id = ?').get(id) as {
				last_used_at: string | null;
			};
			expect(row.last_used_at).not.toBeNull();
		});
	});

	describe('protocol', () => {
		it('completes the 2025 initialize handshake', async () => {
			const { token } = await issueToken();
			const res = await postMcp(
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: { protocolVersion: LEGACY_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '1' } }
				},
				{ authorization: `Bearer ${token}` }
			);
			expect(res.status).toBe(200);
			const result = await readRpcResult(res);
			expect(result.serverInfo).toMatchObject({ name: 'triad-tactics-admin' });
		});

		it('lists every tool with an object input schema on the 2026 revision', async () => {
			const { token } = await issueToken();
			const meta = {
				'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
				'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
				'io.modelcontextprotocol/clientCapabilities': {}
			};
			const res = await postMcp(
				{ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: meta } },
				{ authorization: `Bearer ${token}`, 'mcp-protocol-version': MODERN_VERSION, 'mcp-method': 'tools/list' }
			);
			expect(res.status).toBe(200);
			const { tools } = (await readRpcResult(res)) as { tools: Array<{ name: string; inputSchema: { type: string } }> };
			const names = tools.map((tool) => tool.name);
			expect(new Set(names).size).toBe(names.length);
			for (const tool of tools) expect(tool.inputSchema.type).toBe('object');
			expect(names).toEqual(
				expect.arrayContaining([
					'whoami',
					'db_query',
					'applications_confirm',
					'games_publish',
					'units_delete',
					'sanctions_create',
					'replays_publish',
					'stats_publish',
					'rotation_update'
				])
			);
		});
	});

	describe('tools', () => {
		it('acts as the token owner on admin routes', async () => {
			const { token } = await issueToken();
			const whoami = JSON.parse(toolText(await callTool(token, 'whoami')));
			expect(whoami.steamid64).toBe(ADMIN_STEAM_ID);

			const created = await callTool(token, 'badges_create', { label: 'Veteran' });
			expect(created.isError).toBeFalsy();
			expect(JSON.parse(toolText(created)).badge).toMatchObject({
				label: 'Veteran',
				created_by_steamid64: ADMIN_STEAM_ID
			});
		});

		it('explains invalid and unknown arguments', async () => {
			const { token } = await issueToken();
			const invalid = await callTool(token, 'badges_create', { label: '' });
			expect(invalid.isError).toBe(true);
			expect(toolText(invalid)).toContain('label');

			const unknown = await callTool(token, 'badges_create', { label: 'x', colour: 'red' });
			expect(unknown.isError).toBe(true);
			expect(toolText(unknown)).toContain('colour');
		});

		it('reports route errors with their HTTP status', async () => {
			const { token } = await issueToken();
			const result = await callTool(token, 'games_get', { missionId: 999999 });
			expect(result.isError).toBe(true);
			expect(toolText(result)).toMatch(/^HTTP 404/);
		});

		it('sends a content-length with raw uploads', async () => {
			// No storage: the route must get past its content-length check and stop at the store.
			process.env.REPLAY_S3_ENDPOINT = '';
			const { token } = await issueToken();
			const result = await callTool(token, 'replays_upload_map_piece', {
				sha: 'a'.repeat(64),
				index: 0,
				dataBase64: Buffer.from('piece').toString('base64')
			});
			expect(toolText(result)).toContain('storage_unavailable');
		});
	});

	describe('read-only SQL', () => {
		it('returns columns and rows with bound parameters', async () => {
			const { token } = await issueToken();
			await callTool(token, 'badges_create', { label: 'Alpha' });
			const result = await callTool(token, 'db_query', {
				sql: 'SELECT label FROM badge_types WHERE label = ?',
				params: ['Alpha']
			});
			expect(result.isError).toBeFalsy();
			expect(JSON.parse(toolText(result))).toEqual({
				columns: ['label'],
				rows: [['Alpha']],
				rowCount: 1,
				truncated: false
			});
		});

		it('truncates at maxRows', async () => {
			const { token } = await issueToken();
			const result = await callTool(token, 'db_query', {
				sql: 'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 10) SELECT i FROM n',
				maxRows: 3
			});
			expect(JSON.parse(toolText(result))).toMatchObject({ rowCount: 3, truncated: true });
		});

		it('refuses statements that write', async () => {
			const { token } = await issueToken();
			const result = await callTool(token, 'db_query', { sql: 'DELETE FROM badge_types' });
			expect(result.isError).toBe(true);
			expect(toolText(result)).toContain('not_a_query');
		});

		it('refuses credential tables however they are reached', async () => {
			const { token } = await issueToken();
			for (const sql of [
				'SELECT * FROM steam_sessions',
				'SELECT count(*) FROM "STEAM_SESSIONS"',
				'WITH s AS (SELECT id FROM main.steam_sessions) SELECT * FROM s',
				'SELECT token_hash FROM admin_mcp_tokens'
			]) {
				const result = await callTool(token, 'db_query', { sql });
				expect(result.isError, sql).toBe(true);
				expect(toolText(result), sql).toContain('denied_table');
			}
		});
	});
});
