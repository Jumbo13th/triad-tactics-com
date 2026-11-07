import { getAdminMcpTokensRoute, postAdminMcpTokenRoute } from '@/features/adminMcp/adapters/next/tokensRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const GET = withApiGuards(getAdminMcpTokensRoute, { name: 'api.admin.mcpTokens.list', logSteamId: true });
export const POST = withApiGuards(postAdminMcpTokenRoute, { name: 'api.admin.mcpTokens.create', logSteamId: true });
