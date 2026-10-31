import { NextRequest, NextResponse } from 'next/server';
import { errorToLogObject, logger } from '@/platform/logger';
import { receiverDeps } from '../../deps';
import {
	JSON_MAX_BYTES,
	PIECE_MAX_BYTES,
	fileCommitSchema,
	gamePostSchema,
	isSha256,
	parsePieceIndex,
} from '../../domain/protocol';
import { commitFile } from '../../useCases/commitFile';
import { getFileState } from '../../useCases/getFileState';
import { putPiece } from '../../useCases/putPiece';
import { recordGame } from '../../useCases/recordGame';
import { authenticateUpload } from './uploadAuth';

// ll-upload/1 receiver. The host reads only the status, and the "missing" list of a 409.

type FileContext = { params: Promise<{ sha: string }> };
type PieceContext = { params: Promise<{ sha: string; index: string }> };
type GameContext = { params: Promise<{ session: string }> };

type Accepted = { serverId: string; body: Buffer };

const REFUSALS = {
	400: 'bad_request',
	401: 'unauthorized',
	413: 'too_large',
	503: 'storage_unavailable',
} as const;

function refuse(status: keyof typeof REFUSALS, error: string = REFUSALS[status]): NextResponse {
	return NextResponse.json({ error }, { status });
}

function serverError(): NextResponse {
	return NextResponse.json({ error: 'server_error' }, { status: 500 });
}

function parseJson(body: Buffer): unknown {
	try {
		return JSON.parse(body.toString('utf8')) as unknown;
	} catch {
		return undefined;
	}
}

// Without storage nothing could ever be committed, so pieces are not taken in either;
// a 503 makes the host keep its files and retry with growing waits.
async function accept(request: NextRequest, maxBodyBytes: number): Promise<Accepted | NextResponse> {
	const auth = await authenticateUpload(request, maxBodyBytes);
	if (!auth.ok) return refuse(auth.status);
	if (!receiverDeps.objects.isConfigured()) {
		logger.warn({ serverId: auth.serverId }, 'replay_storage_not_configured');
		return refuse(503);
	}
	return { serverId: auth.serverId, body: auth.body };
}

export async function getReplayFileRoute(request: NextRequest, context: FileContext): Promise<NextResponse> {
	try {
		const accepted = await accept(request, 0);
		if (accepted instanceof NextResponse) return accepted;

		const { sha } = await context.params;
		if (!isSha256(sha)) return refuse(400);

		const state = await getFileState(receiverDeps, sha);
		if (state.state === 'unknown') return NextResponse.json({ error: 'not_found' }, { status: 404 });
		return NextResponse.json(state);
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'replay_file_state_failed');
		return serverError();
	}
}

export async function putReplayPieceRoute(request: NextRequest, context: PieceContext): Promise<NextResponse> {
	try {
		const accepted = await accept(request, PIECE_MAX_BYTES);
		if (accepted instanceof NextResponse) return accepted;

		const { sha, index: indexParam } = await context.params;
		const index = parsePieceIndex(indexParam);
		if (!isSha256(sha) || index === null) return refuse(400);

		const result = await putPiece(receiverDeps, { sha256: sha, index, bytes: accepted.body });
		if (result === 'stored') return NextResponse.json({ ok: true }, { status: 201 });
		if (result === 'held') return NextResponse.json({ ok: true });
		logger.warn({ sha256: sha, index, serverId: accepted.serverId }, 'replay_piece_conflict');
		return NextResponse.json({ error: 'conflict' }, { status: 409 });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'replay_piece_failed');
		return serverError();
	}
}

export async function commitReplayFileRoute(request: NextRequest, context: FileContext): Promise<NextResponse> {
	try {
		const accepted = await accept(request, JSON_MAX_BYTES);
		if (accepted instanceof NextResponse) return accepted;

		const { sha } = await context.params;
		const parsed = fileCommitSchema.safeParse(parseJson(accepted.body));
		if (!isSha256(sha) || !parsed.success) return refuse(400);

		const commit = parsed.data;
		const outcome = await commitFile(receiverDeps, { sha256: sha, serverId: accepted.serverId, commit });
		const logContext = { sha256: sha, kind: commit.kind, serverId: accepted.serverId, session: commit.session };
		switch (outcome.result) {
			case 'stored':
				logger.info({ ...logContext, encodedSize: commit.encodedSize }, 'replay_file_stored');
				return NextResponse.json({ ok: true }, { status: 201 });
			case 'exists':
				return NextResponse.json({ ok: true });
			case 'missing':
				return NextResponse.json({ missing: outcome.missing }, { status: 409 });
			case 'mismatch':
				logger.warn(logContext, 'replay_file_mismatch');
				return NextResponse.json({ error: 'mismatch' }, { status: 422 });
			case 'unstored':
				logger.error({ ...logContext, ...errorToLogObject(outcome.error) }, 'replay_file_storage_failed');
				return refuse(503);
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'replay_file_commit_failed');
		return serverError();
	}
}

export async function postReplayGameRoute(request: NextRequest, context: GameContext): Promise<NextResponse> {
	try {
		const accepted = await accept(request, JSON_MAX_BYTES);
		if (accepted instanceof NextResponse) return accepted;

		const { session } = await context.params;
		const parsed = gamePostSchema.safeParse(parseJson(accepted.body));
		if (!parsed.success || parsed.data.session !== session) return refuse(400);

		const post = parsed.data;
		const outcome = recordGame(receiverDeps, { serverId: accepted.serverId, post });
		switch (outcome.result) {
			case 'created':
			case 'replaced':
				logger.info(
					{
						serverId: accepted.serverId,
						session,
						over: post.over,
						segments: post.segments.length,
						stats: post.stats !== null,
						repeat: outcome.result === 'replaced',
					},
					'replay_game_recorded'
				);
				return NextResponse.json({ ok: true }, { status: outcome.result === 'created' ? 201 : 200 });
			case 'missing':
				return NextResponse.json({ missing: outcome.missing }, { status: 409 });
			case 'wrong_kind':
				logger.warn({ serverId: accepted.serverId, session, sha256: outcome.sha256 }, 'replay_game_wrong_kind');
				return refuse(400, 'wrong_kind');
		}
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'replay_game_failed');
		return serverError();
	}
}
