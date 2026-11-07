import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './adminAuth';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';
import { runGamesCronTasks } from '@/features/games/useCases/runCronTasks';
import { DISCORD_BOT_TOKEN } from '@/platform/env';
import { errorToLogObject, logger } from '@/platform/logger';

export async function postAdminCronRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireAdmin(request);
	if (!admin.ok) return admin.response;

	await runEmailOutboxOnce();
	await runGamesCronTasks({
		actorSteamId64: admin.identity.steamid64,
		discordBotToken: DISCORD_BOT_TOKEN,
		logger,
		errorToLogObject
	});

	return NextResponse.json({ success: true });
}
