import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { errorToLogObject, logger } from '@/platform/logger';
import { receiverDeps } from '../../deps';
import { PIECE_MAX_BYTES, isSha256, parsePieceIndex } from '../../domain/protocol';
import { mapCommitSchema } from '../../domain/requests';
import { putPiece } from '../../useCases/putPiece';
import { commitMapFile } from '../../useCases/uploadMap';

// Map files arrive from the admin page in pieces like the hosts' uploads, so a terrain's
// geometry larger than the proxy's 2 MB body limit still gets through.

export async function putAdminMapPieceRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const length = Number(request.headers.get('content-length'));
		if (!Number.isInteger(length) || length < 1 || length > PIECE_MAX_BYTES) {
			return NextResponse.json({ error: 'too_large' }, { status: 413 });
		}
		const sha = request.nextUrl.searchParams.get('sha') ?? '';
		const index = parsePieceIndex(request.nextUrl.searchParams.get('index') ?? '');
		if (!isSha256(sha) || index === null) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
		if (!receiverDeps.objects.isConfigured()) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });

		const bytes = Buffer.from(await request.arrayBuffer());
		if (bytes.length > PIECE_MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
		const result = await putPiece(receiverDeps, { sha256: sha, index, bytes });
		if (result === 'conflict') return NextResponse.json({ error: 'conflict' }, { status: 409 });
		return NextResponse.json({ ok: true }, { status: result === 'stored' ? 201 : 200 });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_map_piece_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminMapRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
		}
		const parsed = mapCommitSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: 'validation_error' }, { status: 400 });

		const outcome = await commitMapFile(receiverDeps, parsed.data);
		switch (outcome.result) {
			case 'stored':
				logger.info({ kind: parsed.data.kind, sha256: parsed.data.sha256, size: parsed.data.encodedSize }, 'replay_map_file_stored');
				return NextResponse.json({ sha256: parsed.data.sha256 }, { status: 201 });
			case 'missing':
				return NextResponse.json({ missing: outcome.missing }, { status: 409 });
			case 'mismatch':
				return NextResponse.json({ error: 'mismatch' }, { status: 422 });
			case 'unstored':
				logger.error({ ...errorToLogObject(outcome.error) }, 'replay_map_storage_failed');
				return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_map_commit_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
