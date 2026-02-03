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

function getOutboxRowByUserId(userId: number): OutboxRow | undefined {
	const db = getDb();
	return db
		.prepare('SELECT id, payload FROM email_outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1')
		.get(userId) as OutboxRow | undefined;
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
		const userRow = getDb().prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as {
			user_id: number | null;
		};
		const userId = userRow.user_id ?? applicationId;

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId,
			confirmedBySteamId64: '76561198012345678'
		});

		expect(result.ok).toBe(true);
		const row = getOutboxRowByUserId(userId);
		expect(row).toBeDefined();

		const payload = JSON.parse(row?.payload ?? '{}') as Record<string, unknown>;
		expect(payload.toEmail).toBe('applicant@example.com');
		expect(typeof payload.subject).toBe('string');
		expect(typeof payload.textContent).toBe('string');
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

	it('returns database_error when user_id is missing', async () => {
		const record = buildTestApplicationRecord({
			email: 'missing-user@example.com',
			steamid64: '76561198077777777',
			callsign: 'NoUserId'
		});

		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		const db = getDb();
		db.prepare('UPDATE applications SET user_id = NULL WHERE id = ?').run(applicationId);

		const result = await confirmApplicationAndNotify(confirmApplicationAndNotifyDeps, {
			applicationId,
			confirmedBySteamId64: '76561198012345678'
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('database_error');
		}
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
