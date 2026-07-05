import { NextRequest } from 'next/server';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';
import { runGamesCronTasks } from '@/features/games/useCases/runCronTasks';
import { processStrikeEscalation } from '@/features/sanctions/useCases/processStrikeEscalation';
import { processStrikeEscalationDeps } from '@/features/sanctions/deps';
import { DISCORD_BOT_TOKEN } from '@/platform/env';
import { errorToLogObject, logger } from '@/platform/logger';
import { secretEquals } from '@/platform/crypto/secretCompare';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.OUTBOX_CRON_SECRET?.trim();
	if (!secret) return false;

	// Only accept the secret via a request header. A query-string secret would be
	// captured in nginx/access logs, browser history and monitoring traces.
	const header = request.headers.get('authorization') || request.headers.get('x-cron-secret');
	const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
	const token = (bearer || '').trim();
	return secretEquals(token, secret);
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return new Response('Unauthorized', { status: 401 });
	}

	await runEmailOutboxOnce();

	await runGamesCronTasks({
		actorSteamId64: 'system',
		discordBotToken: DISCORD_BOT_TOKEN,
		logger,
		errorToLogObject
	});

	const escalationResult = processStrikeEscalation(processStrikeEscalationDeps, { createdBySteamId64: 'system' });
	if (escalationResult.autoBansCreated > 0) {
		logger.info({ autoBansCreated: escalationResult.autoBansCreated }, 'sanctions_strike_escalation');
	}

	return new Response('OK', { status: 200 });
}
