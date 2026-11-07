import { postAdminMcpTokenRevokeRoute } from '@/features/adminMcp/adapters/next/tokensRoute';
import { withApiGuards } from '@/platform/apiGates';

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminMcpTokenRevokeRoute, { name: 'api.admin.mcpTokens.revoke', logSteamId: true });
