import {
	McpServer,
	fromJsonSchema,
	type JsonSchemaType,
	type JsonSchemaValidator,
	type jsonSchemaValidator
} from '@modelcontextprotocol/server';
import { logger } from '@/platform/logger';
import type { ToolContext } from './tools/defineTool';
import { ADMIN_MCP_TOOLS } from './tools';

// Arguments are checked against the routes' own Zod schemas inside each tool;
// a second, JSON Schema validator here would only disagree with them on
// preprocessed fields and defaults.
const passThroughValidator: jsonSchemaValidator = {
	getValidator<T>(): JsonSchemaValidator<T> {
		return (input: unknown) => ({ valid: true, data: input as T, errorMessage: undefined });
	}
};

const INSTRUCTIONS = [
	'Administration of the Triad Tactics community website, acting as the admin who owns the access token (see whoami).',
	'The tools call the same handlers as the admin panel: every change is validated, audited under that admin and has the same side effects (Discord posts, emails, game-server bans).',
	'Read before writing: list or get the record, then change it. Ask the human before anything destructive or user-visible.',
	'db_schema and db_query answer questions the panel cannot; they are read-only.'
].join(' ');

export function buildAdminMcpServer(ctx: ToolContext): McpServer {
	const server = new McpServer(
		{ name: 'triad-tactics-admin', title: 'Triad Tactics admin', version: '1.0.0' },
		{ instructions: INSTRUCTIONS }
	);

	for (const tool of ADMIN_MCP_TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				annotations: tool.annotations,
				inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputJsonSchema as JsonSchemaType, passThroughValidator)
			},
			async (args) => {
				const result = await tool.invoke(args ?? {}, ctx);
				logger.info(
					{
						tool: tool.name,
						steamid64: ctx.principal.steamid64,
						tokenId: ctx.principal.tokenId,
						isError: result.isError === true
					},
					'admin_mcp_tool_call'
				);
				return result;
			}
		);
	}

	return server;
}
