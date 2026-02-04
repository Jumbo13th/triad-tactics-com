import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedDb } from '../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../fixtures/application';
import { getDb } from '../../fixtures/dbOperations';
import { insertApplication } from '@/features/apply/infra/sqliteApplications';
import { enqueueOutboxEmail } from '@/platform/outbox/emailOutbox';

vi.mock('@/platform/email/brevo', () => ({
	sendOutboxEmail: vi.fn()
}));

import { sendOutboxEmail } from '@/platform/email/brevo';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';

type OutboxRow = {
	status: string;
	attempts: number;
	last_error: string | null;
	next_attempt_at: string | null;
	payload: string;
};

function getOutboxRow(userId: number): OutboxRow | undefined {
	const db = getDb();
	return db
		.prepare(
			'SELECT status, attempts, last_error, next_attempt_at, payload FROM email_outbox WHERE user_id = ? ORDER BY id DESC LIMIT 1'
		)
		.get(userId) as OutboxRow | undefined;
}

describe('email outbox worker', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupIsolatedDb('triad-tactics-mailing-worker');
	});

	it('marks sent when email succeeds', async () => {
		const record = buildTestApplicationRecord({
			email: 'deliver@example.com',
			steamid64: '76561198044444444',
			callsign: 'Deliver'
		});
		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);
		const userRow = getDb().prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as {
			user_id: number | null;
		};
		const userId = userRow.user_id ?? applicationId;

		enqueueOutboxEmail({
			type: 'application_approved',
			userId,
			payload: {
				toEmail: record.email,
				toName: record.answers.name,
				subject: 'Approved',
				textContent: 'Approved body'
			}
		});

		vi.mocked(sendOutboxEmail).mockResolvedValue({ ok: true });

		await runEmailOutboxOnce();

		const row = getOutboxRow(userId);
		expect(row?.status).toBe('sent');
		expect(row?.attempts).toBe(0);
		const db = getDb();
		const appRow = db
			.prepare('SELECT approval_email_sent_at FROM applications WHERE id = ?')
			.get(applicationId) as { approval_email_sent_at: string | null };
		expect(appRow.approval_email_sent_at).toBeNull();
	});

	it('records a retry when send fails', async () => {
		const record = buildTestApplicationRecord({
			email: 'retry@example.com',
			steamid64: '76561198055555555',
			callsign: 'Retry'
		});
		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);
		const userRow = getDb().prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as {
			user_id: number | null;
		};
		const userId = userRow.user_id ?? applicationId;

		enqueueOutboxEmail({
			type: 'application_approved',
			userId,
			payload: {
				toEmail: record.email,
				toName: record.answers.name,
				subject: 'Approved',
				textContent: 'Approved body'
			}
		});

		vi.mocked(sendOutboxEmail).mockResolvedValue({
			ok: false,
			error: 'send_failed',
			details: 'boom'
		});

		await runEmailOutboxOnce();

		const row = getOutboxRow(userId);
		expect(row?.status).toBe('pending');
		expect(row?.attempts).toBe(1);
		expect(row?.last_error).toBe('send_failed');
		expect(row?.next_attempt_at).toBeTruthy();
	});

	it('marks invalid payload as failed without sending', async () => {
		const record = buildTestApplicationRecord({
			email: 'invalid@example.com',
			steamid64: '76561198066666666',
			callsign: 'Invalid'
		});
		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);
		const userRow = getDb().prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as {
			user_id: number | null;
		};
		const userId = userRow.user_id ?? applicationId;

		const db = getDb();
		db.prepare(
			"INSERT INTO email_outbox (type, user_id, payload, status, attempts) VALUES ('application_approved', ?, ?, 'pending', 0)"
		).run(userId, '{not-json');

		await runEmailOutboxOnce();

		const row = getOutboxRow(userId);
		expect(row?.status).toBe('failed');
		expect(row?.last_error).toBe('invalid_payload');
		expect(sendOutboxEmail).not.toHaveBeenCalled();
	});

	it('gives up after the final retry window', async () => {
		const record = buildTestApplicationRecord({
			email: 'giveup@example.com',
			steamid64: '76561198077777777',
			callsign: 'GiveUp'
		});
		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);
		const userRow = getDb().prepare('SELECT user_id FROM applications WHERE id = ?').get(applicationId) as {
			user_id: number | null;
		};
		const userId = userRow.user_id ?? applicationId;

		const payload = JSON.stringify({
			toEmail: record.email,
			toName: record.answers.name,
			subject: 'Approved',
			textContent: 'Approved body'
		});
		const db = getDb();
		db.prepare(
			"INSERT INTO email_outbox (type, user_id, payload, status, attempts) VALUES ('application_approved', ?, ?, 'pending', 6)"
		).run(userId, payload);

		vi.mocked(sendOutboxEmail).mockResolvedValue({
			ok: false,
			error: 'send_failed',
			details: 'final'
		});

		await runEmailOutboxOnce();

		const row = getOutboxRow(userId);
		expect(row?.status).toBe('failed');
		expect(row?.last_error).toBe('send_failed');
	});
});
