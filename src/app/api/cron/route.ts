import { NextRequest } from 'next/server';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';
import { pruneOldAuditEvents } from '@/features/games/infra/sqliteGames';
import { processStrikeEscalation } from '@/features/sanctions/useCases/processStrikeEscalation';
import { processStrikeEscalationDeps } from '@/features/sanctions/deps';
import { logger } from '@/platform/logger';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.OUTBOX_CRON_SECRET?.trim();
	if (!secret) return false;

	const header = request.headers.get('authorization') || request.headers.get('x-cron-secret');
	const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
	const querySecret = request.nextUrl.searchParams.get('secret');
	const token = (bearer || querySecret || '').trim();
	return token.length > 0 && token === secret;
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return new Response('Unauthorized', { status: 401 });
	}

	await runEmailOutboxOnce();

	const auditDeleted = pruneOldAuditEvents(30);
	if (auditDeleted > 0) {
		logger.info({ deleted: auditDeleted }, 'audit_events_pruned');
	}

	const escalationResult = processStrikeEscalation(processStrikeEscalationDeps, { createdBySteamId64: 'system' });
	if (escalationResult.autoBansCreated > 0) {
		logger.info({ autoBansCreated: escalationResult.autoBansCreated }, 'sanctions_strike_escalation');
	}

	return new Response('OK', { status: 200 });
}
