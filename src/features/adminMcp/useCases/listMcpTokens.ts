import type { AdminMcpDeps } from '../ports';
import type { McpTokenSummary } from '../domain/types';

export function listMcpTokens(deps: AdminMcpDeps): McpTokenSummary[] {
	return deps.tokens.listTokens();
}
