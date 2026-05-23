import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorToLogObject, logger } from '@/platform/logger';
import { requireAdmin } from '@/features/admin/adapters/next/adminAuth';
import { listSanctions } from '@/features/sanctions/useCases/listSanctions';
import { createSanction } from '@/features/sanctions/useCases/createSanction';
import { cancelSanction } from '@/features/sanctions/useCases/cancelSanction';
import { updateSanctionExpiry } from '@/features/sanctions/useCases/updateSanctionExpiry';
import { listSanctionsDeps, createSanctionDeps, cancelSanctionDeps, updateSanctionExpiryDeps } from '@/features/sanctions/deps';
import type { SanctionType } from '@/features/sanctions/domain/types';
import { notifySanctionInDiscord } from '@/features/sanctions/useCases/notifySanctionInDiscord';
import { DISCORD_BOT_TOKEN } from '@/platform/env';
import { getDb } from '@/platform/db/connection';

const createSanctionSchema = z.object({
	userId: z.number().int().min(1),
	type: z.enum(['site_ban', 'server_ban', 'strike']),
	reason: z.string(),
	durationMinutes: z.number().nullable().optional()
});

const cancelSanctionSchema = z.object({
	reason: z.string().min(1)
});

const updateExpirySchema = z.object({
	expiresAt: z.string().nullable()
});

const DEFAULT_PAGE_SIZE = 50;

function getCallsignBySteamId64(steamid64: string): string {
	const db = getDb();
	const row = db.prepare(
		'SELECT u.current_callsign FROM user_identities ui JOIN users u ON u.id = ui.user_id WHERE ui.provider = ? AND ui.provider_user_id = ?'
	).get('steam', steamid64) as { current_callsign: string | null } | undefined;
	return row?.current_callsign ?? steamid64;
}

function normalizeTypeFilter(value: string | null): SanctionType | null {
	if (!value) return null;
	const v = value.trim().toLowerCase();
	if (v === 'site_ban' || v === 'server_ban' || v === 'strike') return v;
	return null;
}

function normalizePage(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return 1;
	return parsed;
}

export async function getAdminSanctionsRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const typeFilter = normalizeTypeFilter(request.nextUrl.searchParams.get('type'));
		const q = request.nextUrl.searchParams.get('q') ?? '';
		const page = normalizePage(request.nextUrl.searchParams.get('page'));

		const result = listSanctions(listSanctionsDeps, {
			typeFilter,
			query: q,
			page,
			pageSize: DEFAULT_PAGE_SIZE
		});

		return NextResponse.json({
			success: true,
			sanctions: result.sanctions,
			total: result.total,
			page: result.page,
			pageSize: result.pageSize,
			totalPages: result.totalPages,
			counts: result.counts
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_list_sanctions_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminCreateSanctionRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body = await request.json();
		const parsed = createSanctionSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
		}
		const { userId, type, reason, durationMinutes } = parsed.data;

		const result = createSanction(createSanctionDeps, {
			userId,
			type,
			reason,
			durationMinutes: type === 'strike' ? null : (durationMinutes ?? null),
			createdBySteamId64: admin.identity.steamid64
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		const db = getDb();
		const row = db.prepare('SELECT current_callsign FROM users WHERE id = ?').get(userId) as
			{ current_callsign: string | null } | undefined;
		const callsign = row?.current_callsign ?? `User #${userId}`;
		const adminCallsign = getCallsignBySteamId64(admin.identity.steamid64);

		const effectiveDuration = type === 'strike' ? null : (durationMinutes ?? null);
		let expiresAt: string | null = null;
		if (type === 'strike') {
			const d = new Date();
			d.setMonth(d.getMonth() + 1);
			expiresAt = d.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
		} else if (effectiveDuration !== null) {
			const d = new Date();
			d.setMinutes(d.getMinutes() + effectiveDuration);
			expiresAt = d.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
		}

		notifySanctionInDiscord({
			kind: 'created',
			callsign,
			type,
			reason,
			expiresAt,
			autoEscalation: result.autoEscalation ?? false,
			adminCallsign
		}, DISCORD_BOT_TOKEN).then(() => {
			if (result.autoEscalation) {
				const autoBanExpires = new Date();
				autoBanExpires.setDate(autoBanExpires.getDate() + 7);
				const autoBanExpiresAt = autoBanExpires.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

				return notifySanctionInDiscord({
					kind: 'created',
					callsign,
					type: 'server_ban',
					reason: 'Автоматически: 3 активных предупреждения',
					expiresAt: autoBanExpiresAt,
					autoEscalation: false,
					adminCallsign
				}, DISCORD_BOT_TOKEN);
			}
		}).catch(error => {
			logger.error({ ...errorToLogObject(error) }, 'discord_sanction_notification_failed');
		});

		return NextResponse.json({ success: true, autoEscalation: result.autoEscalation ?? false });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_create_sanction_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminCancelSanctionRoute(
	request: NextRequest,
	{ params }: { params: Promise<{ sanctionId: string }> }
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const { sanctionId: sanctionIdStr } = await params;
		const sanctionId = Number(sanctionIdStr);
		if (!Number.isInteger(sanctionId) || sanctionId < 1) {
			return NextResponse.json({ error: 'invalid_sanction_id' }, { status: 400 });
		}

		const body = await request.json();
		const parsed = cancelSanctionSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'reason_required' }, { status: 400 });
		}

		const result = cancelSanction(cancelSanctionDeps, {
			sanctionId,
			cancelledBySteamId64: admin.identity.steamid64,
			cancelledReason: parsed.data.reason.trim()
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		const db = getDb();
		const sanctionRow = db.prepare(
			'SELECT s.type, s.reason, u.current_callsign AS callsign FROM sanctions s JOIN users u ON u.id = s.user_id WHERE s.id = ?'
		).get(sanctionId) as { type: SanctionType; reason: string; callsign: string | null } | undefined;

		if (sanctionRow) {
			const adminCallsign = getCallsignBySteamId64(admin.identity.steamid64);
			notifySanctionInDiscord({
				kind: 'cancelled',
				callsign: sanctionRow.callsign ?? `Sanction #${sanctionId}`,
				type: sanctionRow.type,
				originalReason: sanctionRow.reason,
				cancelReason: parsed.data.reason.trim(),
				adminCallsign
			}, DISCORD_BOT_TOKEN).catch(error => {
				logger.error({ ...errorToLogObject(error) }, 'discord_sanction_cancel_notification_failed');
			});
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_cancel_sanction_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}

export async function postAdminUpdateSanctionExpiryRoute(
	request: NextRequest,
	{ params }: { params: Promise<{ sanctionId: string }> }
): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const { sanctionId: sanctionIdStr } = await params;
		const sanctionId = Number(sanctionIdStr);
		if (!Number.isInteger(sanctionId) || sanctionId < 1) {
			return NextResponse.json({ error: 'invalid_sanction_id' }, { status: 400 });
		}

		const body = await request.json();
		const parsed = updateExpirySchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'invalid_expires_at' }, { status: 400 });
		}
		const { expiresAt } = parsed.data;
		if (expiresAt !== null) {
			const parsedExpires = new Date(expiresAt.replace(' ', 'T') + 'Z');
			if (isNaN(parsedExpires.getTime())) {
				return NextResponse.json({ error: 'invalid_expires_at' }, { status: 400 });
			}
			if (parsedExpires <= new Date()) {
				return NextResponse.json({ error: 'expires_in_past' }, { status: 400 });
			}
		}

		const result = updateSanctionExpiry(updateSanctionExpiryDeps, {
			sanctionId,
			newExpiresAt: expiresAt,
			updatedBySteamId64: admin.identity.steamid64
		});

		if (!result.success) {
			return NextResponse.json({ success: false, error: result.error }, { status: 400 });
		}

		const db = getDb();
		const sanctionRow = db.prepare(
			'SELECT s.type, s.reason, u.current_callsign AS callsign FROM sanctions s JOIN users u ON u.id = s.user_id WHERE s.id = ?'
		).get(sanctionId) as { type: SanctionType; reason: string; callsign: string | null } | undefined;

		if (sanctionRow) {
			const adminCallsign = getCallsignBySteamId64(admin.identity.steamid64);
			notifySanctionInDiscord({
				kind: 'expiry_changed',
				callsign: sanctionRow.callsign ?? `Sanction #${sanctionId}`,
				type: sanctionRow.type,
				originalReason: sanctionRow.reason,
				newExpiresAt: expiresAt,
				adminCallsign
			}, DISCORD_BOT_TOKEN).catch(error => {
				logger.error({ ...errorToLogObject(error) }, 'discord_sanction_expiry_notification_failed');
			});
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'admin_update_sanction_expiry_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
