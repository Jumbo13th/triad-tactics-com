import { beforeAll, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../fixtures/application';
import { createSteamSession } from '../../../fixtures/steamSession';
async function loadHandlers() {
	const { POST: POST_RENAME } = await import('@/app/api/rename/route');
	const { POST: POST_RENAME_REQUIRED } = await import('@/app/api/admin/rename-required/route');
	const { POST: POST_CONFIRM } = await import('@/app/api/admin/confirm/route');
	const { POST: POST_DECIDE } = await import('@/app/api/admin/rename-requests/decide/route');
	const { POST: POST_SUBMIT } = await import('@/app/api/submit/route');
	const { NextRequest } = await import('next/server');
	return { POST_RENAME, POST_RENAME_REQUIRED, POST_CONFIRM, POST_DECIDE, POST_SUBMIT, NextRequest };
}
describe('Rename flow (e2e via API handlers)', () => {
	beforeAll(async () => {
		await setupIsolatedDb({
			prefix: 'triad-tactics-rename-e2e-test',
			adminSteamIds: '76561198012345678'
		});
	});

	it('blocks APIs until rename request is submitted; admin can approve and clear the rename block', async () => {
		const { POST_RENAME, POST_RENAME_REQUIRED, POST_CONFIRM, POST_DECIDE, POST_SUBMIT, NextRequest } =
			await loadHandlers();
		const { dbOperations } = await import('../../../fixtures/dbOperations');

		const adminSid = createSteamSession(dbOperations, {
			steamid64: '76561198012345678',
			redirectPath: '/en/admin'
		});
		const userSteamId = '76561198000000030';
		const userSid = createSteamSession(dbOperations, { steamid64: userSteamId, redirectPath: '/en' });

		// Model the real-world flow: rename-required happens to users who already applied.
		const inserted = dbOperations.insertApplication(
			buildTestApplicationRecord({
				email: `rename-e2e-${crypto.randomUUID()}@example.com`,
				steamid64: userSteamId,
				callsign: 'Exist_E2E'
			})
		);
		expect(inserted.success).toBe(true);
		if (!inserted.success) throw new Error('Expected application to be inserted');
		const applicationId = Number(inserted.id);
		expect(Number.isFinite(applicationId)).toBe(true);

		// Admin: confirm the application (required for rename-required).
		const resConfirm = await POST_CONFIRM(
			new NextRequest('http://localhost/api/admin/confirm', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ applicationId })
			})
		);
		expect(resConfirm.status).toBe(200);

		// Admin: mark user as rename-required.
		const resRequire = await POST_RENAME_REQUIRED(
			new NextRequest('http://localhost/api/admin/rename-required', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ steamid64: userSteamId, action: 'require', reason: 'Policy' })
			})
		);
		expect(resRequire.status).toBe(200);

		// User: most APIs are blocked while rename_required and no pending request.
		const blocked = await POST_SUBMIT(
			new NextRequest('http://localhost/api/submit', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${userSid}`
				},
				body: JSON.stringify({ callsign: 'Anything' })
			})
		);
		expect(blocked.status).toBe(409);
		expect((await blocked.json()).error).toBe('rename_required');

		// User: can submit a rename request.
		const resRename = await POST_RENAME(
			new NextRequest('http://localhost/api/rename', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${userSid}`
				},
				body: JSON.stringify({ callsign: 'Rename_E2E' })
			})
		);
		expect(resRename.status).toBe(200);
		const jsonRename = await resRename.json();
		expect(jsonRename.ok).toBe(true);
		expect(jsonRename.status).toBe('created');
		const requestId = jsonRename.requestId as number;
		expect(Number.isFinite(requestId)).toBe(true);

		// After pending request exists, rename gate lifts; apply gate should now block /api/submit.
		const blockedApply = await POST_SUBMIT(
			new NextRequest('http://localhost/api/submit', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${userSid}`
				},
				body: JSON.stringify({ callsign: 'Anything' })
			})
		);
		// The request should now reach the submit handler (which rejects the invalid payload).
		expect(blockedApply.status).toBe(400);
		expect((await blockedApply.json()).error).toBe('validation_error');

		// Admin: approve.
		const resApprove = await POST_DECIDE(
			new NextRequest('http://localhost/api/admin/rename-requests/decide', {
				method: 'POST',
				headers: {
					origin: 'http://localhost',
					'content-type': 'application/json',
					cookie: `tt_steam_session=${adminSid}`
				},
				body: JSON.stringify({ requestId, decision: 'approve' })
			})
		);
		expect(resApprove.status).toBe(200);
		expect((await resApprove.json()).success).toBe(true);

		// DB: user callsign updated and rename flags cleared.
		const user = dbOperations.getUserBySteamId64(userSteamId);
		expect(user).toBeTruthy();
		expect(user?.current_callsign).toBe('Rename_E2E');
		expect(user?.rename_required_at).toBeNull();
		expect(user?.rename_required_reason).toBeNull();
		expect(user?.rename_required_by_steamid64).toBeNull();

		// Still blocked from submit because the user hasn't applied (rename block is now gone).
		const stillBlocked = await POST_SUBMIT(
			new NextRequest('http://localhost/api/submit', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: `tt_steam_session=${userSid}`
				},
				body: JSON.stringify({ callsign: 'Anything' })
			})
		);
		expect(stillBlocked.status).toBe(400);
		expect((await stillBlocked.json()).error).toBe('validation_error');
	});
});
