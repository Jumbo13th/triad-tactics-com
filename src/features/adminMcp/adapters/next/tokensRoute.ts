import { NextRequest, NextResponse } from 'next/server';
import { isDelegatedAdminRequest, requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { adminMcpDeps } from '@/features/adminMcp/deps';
import { createMcpTokenRequestSchema } from '@/features/adminMcp/domain/requests';
import { MAX_ACTIVE_MCP_TOKENS_PER_ADMIN } from '@/features/adminMcp/domain/types';
import { issueMcpToken } from '@/features/adminMcp/useCases/issueMcpToken';
import { listMcpTokens } from '@/features/adminMcp/useCases/listMcpTokens';
import { revokeMcpToken } from '@/features/adminMcp/useCases/revokeMcpToken';
import { errorToLogObject, logger } from '@/platform/logger';

type TokenRouteContext = { params: Promise<{ tokenId: string }> };

// Token management needs a browser session: a leaked token must not be able to
// mint a replacement for itself or revoke the tokens of whoever is cleaning up.
function requireSessionAdmin(request: NextRequest) {
	if (isDelegatedAdminRequest(request)) {
		return { ok: false as const, response: NextResponse.json({ error: 'session_required' }, { status: 403 }) };
	}
	return requireAdmin(request);
}

export async function getAdminMcpTokensRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireSessionAdmin(request);
	if (!admin.ok) return admin.response;

	try {
		return NextResponse.json({
			success: true,
			viewerSteamid64: admin.identity.steamid64,
			maxActivePerAdmin: MAX_ACTIVE_MCP_TOKENS_PER_ADMIN,
			tokens: listMcpTokens(adminMcpDeps)
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_mcp_tokens_list_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminMcpTokenRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireSessionAdmin(request);
	if (!admin.ok) return admin.response;

	try {
		const body: unknown = await request.json().catch(() => null);
		const parsed = createMcpTokenRequestSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: 'validation_error' }, { status: 400 });

		const result = issueMcpToken(adminMcpDeps, { ...parsed.data, steamid64: admin.identity.steamid64 });
		if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

		logger.info({ tokenId: result.summary.id, steamid64: admin.identity.steamid64 }, 'admin_mcp_token_issued');
		return NextResponse.json({ success: true, token: result.token, summary: result.summary });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_mcp_token_issue_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminMcpTokenRevokeRoute(request: NextRequest, context: TokenRouteContext): Promise<NextResponse> {
	const admin = requireSessionAdmin(request);
	if (!admin.ok) return admin.response;

	try {
		const tokenId = Number((await context.params).tokenId);
		if (!Number.isInteger(tokenId) || tokenId < 1) return NextResponse.json({ error: 'invalid_token_id' }, { status: 400 });

		const result = revokeMcpToken(adminMcpDeps, { tokenId, revokedBySteamid64: admin.identity.steamid64 });
		if (result === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });

		logger.info({ tokenId, steamid64: admin.identity.steamid64, result }, 'admin_mcp_token_revoked');
		return NextResponse.json({ success: true, alreadyRevoked: result === 'already_revoked' });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_mcp_token_revoke_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
