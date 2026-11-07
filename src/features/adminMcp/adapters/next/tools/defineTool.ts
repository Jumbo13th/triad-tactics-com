import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import { actAsAdmin } from '@/features/admin/adapters/next/adminAuth';
import type { McpPrincipal } from '@/features/adminMcp/domain/types';
import { errorToLogObject, logger } from '@/platform/logger';

export type ToolContext = {
	principal: McpPrincipal;
	/** The MCP request's URL and forwarding headers, so handlers that build public links see the real host. */
	origin: { url: string; forwardedHost: string | null; forwardedProto: string | null };
};

export type AdminTool = {
	name: string;
	title: string;
	description: string;
	annotations: ToolAnnotations;
	inputJsonSchema: Record<string, unknown>;
	invoke: (args: Record<string, unknown>, ctx: ToolContext) => Promise<CallToolResult>;
};

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type RouteToolSpec<TParams> = {
	name: string;
	title: string;
	description: string;
	annotations: ToolAnnotations;
	method: HttpMethod;
	/** Route path with `{param}` placeholders, e.g. `/api/admin/games/{missionId}/publish`. */
	path: string;
	pathParams?: Record<string, z.ZodType>;
	query?: Record<string, z.ZodType>;
	/**
	 * The route's own request schema. An object schema's fields become top-level
	 * tool arguments; any other schema is taken as a single `body` argument.
	 */
	body?: z.ZodType;
	/** For routes that read something other than a JSON body (multipart, raw bytes). */
	encodeBody?: (body: Record<string, unknown>) => { body: BodyInit; contentType: string };
	handler: (request: NextRequest, context: { params: Promise<TParams> }) => Response | Promise<Response>;
};

export function errorResult(message: string): CallToolResult {
	return { content: [{ type: 'text', text: message }], isError: true };
}

export function jsonResult(value: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function toJsonSchema(schema: z.ZodObject): Record<string, unknown> {
	const json = z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12', unrepresentable: 'any' }) as Record<
		string,
		unknown
	>;
	delete json.$schema;
	// A field the route fills in when absent (z.preprocess to null) is emitted as
	// required; the caller may leave it out.
	if (Array.isArray(json.required)) {
		const required = (json.required as string[]).filter((key) => !schema.shape[key]?.safeParse(undefined).success);
		if (required.length > 0) json.required = required;
		else delete json.required;
	}
	return json;
}

function describeIssues(error: z.ZodError): string {
	return `Invalid arguments:\n${z.prettifyError(error)}`;
}

function byteLength(body: BodyInit): number | null {
	if (typeof body === 'string') return Buffer.byteLength(body);
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
	if (body instanceof Blob) return body.size;
	return null;
}

async function toToolResult(response: Response): Promise<CallToolResult> {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
	const isError = response.status >= 400;

	if (!isError && contentType.startsWith('image/')) {
		const data = Buffer.from(await response.arrayBuffer()).toString('base64');
		return { content: [{ type: 'image', data, mimeType: contentType.split(';')[0].trim() }] };
	}

	let text = await response.text();
	if (contentType.includes('application/json')) {
		try {
			text = JSON.stringify(JSON.parse(text));
		} catch {
			// keep the raw body
		}
	}
	if (isError) return errorResult(`HTTP ${response.status}: ${text}`);
	return { content: [{ type: 'text', text: text.length > 0 ? text : `HTTP ${response.status}` }] };
}

/**
 * A tool that runs an existing admin route handler in-process as the token's
 * admin, so it shares the panel's validation, audit events and side effects.
 */
export function defineRouteTool<TParams>(spec: RouteToolSpec<TParams>): AdminTool {
	const pathParams = spec.pathParams ?? {};
	const query = spec.query ?? {};
	const bodyIsObject = spec.body instanceof z.ZodObject;
	const bodyShape: Record<string, z.ZodType> = spec.body
		? bodyIsObject
			? (spec.body as z.ZodObject).shape
			: { body: spec.body }
		: {};

	const seen = new Set<string>();
	for (const key of [...Object.keys(pathParams), ...Object.keys(query), ...Object.keys(bodyShape)]) {
		if (seen.has(key)) throw new Error(`admin_mcp_tool_argument_collision: ${spec.name}.${key}`);
		seen.add(key);
	}

	const routeArgsSchema = z.object({ ...pathParams, ...query });
	const inputSchema = z.object({ ...pathParams, ...query, ...bodyShape });

	return {
		name: spec.name,
		title: spec.title,
		description: spec.description,
		annotations: spec.annotations,
		inputJsonSchema: toJsonSchema(inputSchema),
		invoke: async (args, ctx) => {
			const unknownKeys = Object.keys(args).filter((key) => !seen.has(key));
			if (unknownKeys.length > 0) return errorResult(`Unknown argument(s): ${unknownKeys.join(', ')}`);

			const routeArgs: Record<string, unknown> = {};
			const bodyArgs: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(args)) {
				if (key in pathParams || key in query) routeArgs[key] = value;
				else bodyArgs[key] = value;
			}

			const parsedRouteArgs = routeArgsSchema.safeParse(routeArgs);
			if (!parsedRouteArgs.success) return errorResult(describeIssues(parsedRouteArgs.error));

			// The route parses again; the raw arguments are forwarded so its own
			// transforms and defaults apply exactly once.
			const rawBody = bodyIsObject ? bodyArgs : bodyArgs.body;
			if (spec.body) {
				const parsedBody = spec.body.safeParse(rawBody);
				if (!parsedBody.success) return errorResult(describeIssues(parsedBody.error));
			}

			let path = spec.path;
			const paramValues: Record<string, string> = {};
			for (const key of Object.keys(pathParams)) {
				const value = String((parsedRouteArgs.data as Record<string, unknown>)[key]);
				paramValues[key] = value;
				path = path.replace(`{${key}}`, encodeURIComponent(value));
			}

			const url = new URL(path, ctx.origin.url);
			for (const key of Object.keys(query)) {
				const value = (parsedRouteArgs.data as Record<string, unknown>)[key];
				if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
			}

			const headers = new Headers();
			if (ctx.origin.forwardedHost) headers.set('x-forwarded-host', ctx.origin.forwardedHost);
			if (ctx.origin.forwardedProto) headers.set('x-forwarded-proto', ctx.origin.forwardedProto);

			let body: BodyInit | undefined;
			if (spec.encodeBody) {
				const encoded = spec.encodeBody(bodyArgs);
				body = encoded.body;
				headers.set('content-type', encoded.contentType);
			} else if (spec.body) {
				body = JSON.stringify(rawBody ?? {});
				headers.set('content-type', 'application/json');
			}
			// A request over the wire always carries this; routes that bound uploads by it
			// refuse a body without one.
			const length = body === undefined ? null : byteLength(body);
			if (length !== null) headers.set('content-length', String(length));

			const request = new NextRequest(url, { method: spec.method, headers, body });
			actAsAdmin(request, ctx.principal.steamid64);

			try {
				const response = await spec.handler(request, { params: Promise.resolve(paramValues as TParams) });
				return await toToolResult(response);
			} catch (error) {
				logger.error({ ...errorToLogObject(error), tool: spec.name }, 'admin_mcp_route_tool_failed');
				return errorResult('HTTP 500: {"error":"server_error"}');
			}
		}
	};
}

/** A tool with its own implementation instead of an admin route behind it. */
export function defineTool<TInput extends z.ZodObject>(spec: {
	name: string;
	title: string;
	description: string;
	annotations: ToolAnnotations;
	input: TInput;
	run: (args: z.output<TInput>, ctx: ToolContext) => CallToolResult | Promise<CallToolResult>;
}): AdminTool {
	return {
		name: spec.name,
		title: spec.title,
		description: spec.description,
		annotations: spec.annotations,
		inputJsonSchema: toJsonSchema(spec.input),
		invoke: async (args, ctx) => {
			const parsed = spec.input.strict().safeParse(args);
			if (!parsed.success) return errorResult(describeIssues(parsed.error));
			return spec.run(parsed.data as z.output<TInput>, ctx);
		}
	};
}
