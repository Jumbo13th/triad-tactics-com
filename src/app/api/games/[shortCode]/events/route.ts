import type { NextRequest } from 'next/server';
import { slottingEventBus } from '@/platform/sse/eventBus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EventsRouteContext = {
	params: Promise<{ shortCode: string }>;
};

export async function GET(request: NextRequest, context: EventsRouteContext): Promise<Response> {
	const { shortCode } = await context.params;
	const normalizedCode = shortCode.trim().toLowerCase();
	if (!normalizedCode) {
		return new Response('Bad Request', { status: 400 });
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const unsubscribe = slottingEventBus.subscribe((event) => {
				if (event.shortCode.toLowerCase() !== normalizedCode) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// Stream closed
				}
			});

			// Keepalive every 30s
			const keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					// Stream closed
				}
			}, 30_000);

			// Cleanup on abort
			request.signal.addEventListener('abort', () => {
				unsubscribe();
				clearInterval(keepalive);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
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
