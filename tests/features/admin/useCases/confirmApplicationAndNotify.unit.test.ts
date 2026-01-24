import { beforeEach, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../fixtures/application';
import { getDb } from '../../../fixtures/dbOperations';
import { confirmApplicationAndNotify } from '@/features/admin/useCases/confirmApplicationAndNotify';
import { confirmApplicationAndNotifyDeps } from '@/features/admin/deps';
import { insertApplication } from '@/features/apply/infra/sqliteApplications';

type OutboxRow = {
	id: number;
	payload: string;
};

function getOutboxRowByApplicationId(applicationId: number): OutboxRow | undefined {
	const db = getDb();
	return db
		.prepare('SELECT id, payload FROM email_outbox WHERE application_id = ? ORDER BY id DESC LIMIT 1')
		.get(applicationId) as OutboxRow | undefined;
}

function countOutboxRows(): number {
	const db = getDb();
	const row = db.prepare('SELECT COUNT(*) as count FROM email_outbox').get() as {
		count: number;
	};
	return row.count;
}

describe('confirmApplicationAndNotify (mailing)', () => {
	beforeEach(async () => {
		await setupIsolatedDb('triad-tactics-mailing-confirm');
	});

	it('enqueues an approval email when eligible', async () => {
		const record = buildTestApplicationRecord({
			email: 'applicant@example.com',
			steamid64: '76561198011111111',
			callsign: 'Ghost'
		});

		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId,
			confirmedBySteamId64: '76561198012345678'
		});

		expect(result.ok).toBe(true);
		const row = getOutboxRowByApplicationId(applicationId);
		expect(row).toBeDefined();

		const payload = JSON.parse(row?.payload ?? '{}') as Record<string, unknown>;
		expect(payload.toEmail).toBe('applicant@example.com');
		expect(payload.callsign).toBe('Ghost');
		expect(payload.renameRequired).toBe(false);
	});

	it('does not enqueue when email is missing', async () => {
		const record = buildTestApplicationRecord({
			email: '',
			steamid64: '76561198022222222',
			callsign: 'NoMail'
		});

		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId,
			confirmedBySteamId64: '76561198012345678'
		});

		expect(result.ok).toBe(true);
		expect(countOutboxRows()).toBe(0);
	});

	it('does not enqueue when approval email already sent', async () => {
		const record = buildTestApplicationRecord({
			email: 'sent@example.com',
			steamid64: '76561198033333333',
			callsign: 'AlreadySent'
		});

		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		const db = getDb();
		db.prepare('UPDATE applications SET approval_email_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(
			applicationId
		);

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId,
			confirmedBySteamId64: '76561198012345678'
		});

		expect(result.ok).toBe(true);
		expect(countOutboxRows()).toBe(0);
	});
});
