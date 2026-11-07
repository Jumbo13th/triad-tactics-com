import type { AdminMcpDeps } from './ports';
import { MCP_TOKEN_PREFIX } from './domain/types';
import {
	countActiveTokens,
	findActiveTokenByHash,
	insertToken,
	listTokens,
	revokeToken,
	touchToken
} from './infra/sqliteAdminMcpTokens';
import { generateAccessToken, hashAccessToken } from '@/platform/crypto/accessToken';
import { isAdminSteamId } from '@/platform/admin';

export const adminMcpDeps: AdminMcpDeps = {
	tokens: {
		insertToken,
		countActiveTokens,
		listTokens,
		findActiveTokenByHash,
		touchToken,
		revokeToken
	},
	secrets: {
		generateToken: () => generateAccessToken(MCP_TOKEN_PREFIX),
		hashToken: hashAccessToken
	},
	admin: {
		isAdminSteamId
	}
};
