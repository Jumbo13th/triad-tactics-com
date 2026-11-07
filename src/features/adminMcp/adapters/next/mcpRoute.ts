import { NextRequest, NextResponse } from 'next/server';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { adminMcpDeps } from '@/features/adminMcp/deps';
import { authenticateMcpToken } from '@/features/adminMcp/useCases/authenticateMcpToken';
import type { McpPrincipal } from '@/features/adminMcp/domain/types';
import { errorToLogObject, logger } from '@/platform/logger';
import { buildAdminMcpServer } from './adminMcpServer';
import type { ToolContext } from './tools/defineTool';

type AdminMcpAuthExtra = { principal: McpPrincipal; origin: ToolContext['origin'] };

const mcpHandler = createMcpHandler(
	(requestContext) => {
		const extra = requestContext.authInfo?.extra as AdminMcpAuthExtra | undefined;
		if (!extra) throw new Error('admin_mcp_missing_principal');
		return buildAdminMcpServer({ principal: extra.principal, origin: extra.origin });
	},
	{
		legacy: 'stateless',
		onerror: (error) => logger.warn({ ...errorToLogObject(error) }, 'admin_mcp_protocol_error')
	}
);

function readBearerToken(request: NextRequest): string | null {
	const match = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i);
	return match ? match[1] : null;
}

function getExpectedOrigin(request: NextRequest): string {
	const forwardedProto = request.headers.get('x-forwarded-proto');
	const forwardedHost = request.headers.get('x-forwarded-host');
	if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
	return new URL(request.url).origin;
}

function unauthorized(error: 'invalid_token' | 'not_admin'): NextResponse {
	if (error === 'not_admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
	return NextResponse.json(
		{ error: 'invalid_token' },
		{ status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="triad-tactics-admin", error="invalid_token"' } }
	);
}

export async function handleAdminMcpRequest(request: NextRequest): Promise<Response> {
	// Browsers send Origin on cross-site requests and MCP clients send none, so a
	// foreign Origin can only be a web page (DNS rebinding included).
	const origin = request.headers.get('origin');
	if (origin && origin !== getExpectedOrigin(request)) {
		return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
	}

	const auth = authenticateMcpToken(adminMcpDeps, readBearerToken(request));
	if (!auth.ok) return unauthorized(auth.error);

	const extra: AdminMcpAuthExtra = {
		principal: auth.principal,
		origin: {
			url: request.url,
			forwardedHost: request.headers.get('x-forwarded-host'),
			forwardedProto: request.headers.get('x-forwarded-proto')
		}
	};

	return mcpHandler.fetch(request, {
		authInfo: {
			token: `token:${auth.principal.tokenId}`,
			clientId: `admin-mcp-token-${auth.principal.tokenId}`,
			scopes: ['admin'],
			extra
		}
	});
}
