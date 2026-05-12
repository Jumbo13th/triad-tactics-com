import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';
import { pruneOldAuditEvents } from '@/features/games/infra/sqliteGames';
import { logger } from '@/platform/logger';
import { withApiGuards } from '@/platform/apiGates';

async function postAdminCronRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireAdmin(request);
	if (!admin.ok) return admin.response;

	await runEmailOutboxOnce();

	const auditDeleted = pruneOldAuditEvents(30);
	if (auditDeleted > 0) {
		logger.info({ deleted: auditDeleted, actor: admin.identity.steamid64 }, 'audit_events_pruned_by_admin');
	}

	return NextResponse.json({ success: true });
}

export const runtime = 'nodejs';

export const POST = withApiGuards(postAdminCronRoute, {
	name: 'api.admin.cron.post',
	logSteamId: true
});
