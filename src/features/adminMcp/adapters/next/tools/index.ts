import type { AdminTool } from './defineTool';
import { adminTools } from './adminTools';
import { communityTools } from './communityTools';
import { databaseTools } from './databaseTools';
import { gamesTools } from './gamesTools';
import { replaysStatsTools } from './replaysStatsTools';

export const ADMIN_MCP_TOOLS: AdminTool[] = [
	...databaseTools,
	...adminTools,
	...gamesTools,
	...communityTools,
	...replaysStatsTools
];
