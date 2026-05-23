import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { createGameDraftRequestSchema } from '@/features/games/domain/requests';
import { createGameDraftDeps, deleteCurrentDraftDeps } from '@/features/games/deps';
import { createGameDraft } from '@/features/games/useCases/createGameDraft';
import { deleteCurrentDraft } from '@/features/games/useCases/deleteCurrentDraft';
import { errorToLogObject, logger } from '@/platform/logger';

async function readDraftRequestBody(request: NextRequest): Promise<unknown> {
	const raw = await request.text();
	if (!raw.trim()) return {};
	return JSON.parse(raw) as unknown;
}

export async function postAdminGameDraftRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		let body: unknown;
		try {
			body = await readDraftRequestBody(request);
		} catch {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const parsed = createGameDraftRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const created = createGameDraft(createGameDraftDeps, {
			mode: parsed.data.mode,
			gameMode: parsed.data.gameMode,
			createdBySteamId64: admin.identity.steamid64
		});

		if (!created.ok) {
			const status = created.error === 'database_error' ? 500 : 409;
			return NextResponse.json({ error: created.error }, { status });
		}

		return NextResponse.json({ success: true, mission: created.mission });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_draft_create_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function deleteAdminGameDraftRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const deleted = deleteCurrentDraft(deleteCurrentDraftDeps);
		if (!deleted.ok) {
			const status = deleted.error === 'not_found' ? 404 : 500;
			return NextResponse.json({ error: deleted.error }, { status });
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_game_draft_delete_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
