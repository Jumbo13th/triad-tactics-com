import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { DISABLE_RATE_LIMITS } from '@/platform/config';
import { errorToLogObject, logger } from '@/platform/logger';
import { getClientIp } from '@/platform/net/clientIp';
import { consumeFixedWindowRateLimit } from '@/platform/rateLimit';
import { publicReplaysDeps } from '../../deps';
import { isSha256 } from '../../domain/protocol';
import { openReplayFile } from '../../useCases/viewReplays';

type FileContext = { params: Promise<{ sha: string }> };

// A replay is a few files fetched once and then cached for good, so a viewer needs only a
// handful of requests; the cap keeps one address from pulling files in a loop.
const FILES_PER_MINUTE = 60;

export async function getViewerFileRoute(request: NextRequest, context: FileContext): Promise<Response> {
	try {
		const { sha } = await context.params;
		if (!isSha256(sha)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

		if (!DISABLE_RATE_LIMITS) {
			const decision = consumeFixedWindowRateLimit(`replay-file:${getClientIp(request)}`, 60, FILES_PER_MINUTE);
			if (!decision.allowed) {
				return NextResponse.json(
					{ error: 'rate_limited' },
					{ status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
				);
			}
		}

		const opened = await openReplayFile(publicReplaysDeps, {
			sha256: sha,
			viewerIsAdmin: () => requireAdmin(request).ok,
		});
		if (!opened) return NextResponse.json({ error: 'not_found' }, { status: 404 });

		// Files are named by their content, so a public one can be cached forever.
		const headers = new Headers({
			'Content-Type': opened.contentType,
			'Cache-Control': opened.public ? 'public, max-age=31536000, immutable' : 'private, no-store',
		});
		if (opened.gzip) headers.set('Content-Encoding', 'gzip');
		if (opened.stored.size !== null) headers.set('Content-Length', String(opened.stored.size));
		return new Response(opened.stored.body, { status: 200, headers });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'replay_viewer_file_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 502 });
	}
}
