import type { McpTokenExpiryDays, McpTokenSummary } from './domain/types';

export type AdminMcpTokenRepo = {
	insertToken: (input: {
		steamid64: string;
		label: string;
		tokenHash: string;
		tokenHint: string;
		expiresInDays: McpTokenExpiryDays;
	}) => McpTokenSummary;
	countActiveTokens: (steamid64: string) => number;
	listTokens: () => McpTokenSummary[];
	findActiveTokenByHash: (tokenHash: string) => { id: number; steamid64: string; label: string } | null;
	touchToken: (id: number) => void;
	revokeToken: (input: { id: number; revokedBySteamid64: string }) => 'revoked' | 'not_found' | 'already_revoked';
};

export type AdminMcpDeps = {
	tokens: AdminMcpTokenRepo;
	secrets: {
		generateToken: () => string;
		hashToken: (token: string) => string;
	};
	admin: {
		isAdminSteamId: (steamid64: string) => boolean;
	};
};
