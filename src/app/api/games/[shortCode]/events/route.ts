import type { NextRequest } from 'next/server';
import { withApiGuards } from '@/platform/apiGates';
import { slottingEventBus } from '@/platform/sse/eventBus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EventsRouteContext = {
	params: Promise<{ shortCode: string }>;
};

async function getEventsRoute(request: NextRequest, context: EventsRouteContext): Promise<Response> {
	const { shortCode } = await context.params;
	const normalizedCode = shortCode.trim().toLowerCase();
	if (!normalizedCode) {
		return new Response('Bad Request', { status: 400 });
	}

	const encoder = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream({
		start(controller) {
			const unsubscribe = slottingEventBus.subscribe((event) => {
				if (event.shortCode.toLowerCase() !== normalizedCode) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch { /* stream closed */ }
			});

			const keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch { /* stream closed */ }
			}, 30_000);

			cleanup = () => {
				unsubscribe();
				clearInterval(keepalive);
				try { controller.close(); } catch { /* already closed */ }
			};

			request.signal.addEventListener('abort', cleanup);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

export const GET = withApiGuards(getEventsRoute, {
	name: 'api.games.events',
	logSteamId: true
});
