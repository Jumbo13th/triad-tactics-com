import { handleAdminMcpRequest } from '@/features/adminMcp/adapters/next/mcpRoute';
import { withApiLogging } from '@/platform/nextRouteLogging';

export const runtime = 'nodejs';

export const POST = withApiLogging(handleAdminMcpRequest, { name: 'api.mcp' });
export const GET = withApiLogging(handleAdminMcpRequest, { name: 'api.mcp' });
export const DELETE = withApiLogging(handleAdminMcpRequest, { name: 'api.mcp' });
