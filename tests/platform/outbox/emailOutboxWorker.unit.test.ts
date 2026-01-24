import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIsolatedDb } from '../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../fixtures/application';
import { insertApplication } from '@/features/apply/infra/sqliteApplications';
import { enqueueApplicationApprovedEmail } from '@/platform/outbox/emailOutbox';
import { getDb } from '@/platform/db/connection';

vi.mock('@/platform/email/brevo', () => ({
	sendApplicationApprovedEmail: vi.fn()
}));

import { sendApplicationApprovedEmail } from '@/platform/email/brevo';
import { runEmailOutboxOnce } from '@/platform/outbox/emailOutboxWorker';

type OutboxRow = {
	status: string;
	attempts: number;
	last_error: string | null;
	next_attempt_at: string | null;
	payload: string;
};

function getOutboxRow(applicationId: number): OutboxRow | undefined {
	const db = getDb();
	return db
		.prepare(
			'SELECT status, attempts, last_error, next_attempt_at, payload FROM email_outbox WHERE application_id = ? ORDER BY id DESC LIMIT 1'
		)
		.get(applicationId) as OutboxRow | undefined;
}

describe('email outbox worker', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupIsolatedDb('triad-tactics-mailing-worker');
	});

	it('marks sent and updates application when email succeeds', async () => {
		const record = buildTestApplicationRecord({
			email: 'deliver@example.com',
			steamid64: '76561198044444444',
			callsign: 'Deliver'
		});
		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		enqueueApplicationApprovedEmail({
			applicationId,
			toEmail: record.email,
			toName: record.answers.name,
			callsign: record.answers.callsign,
			locale: record.locale
		});

		vi.mocked(sendApplicationApprovedEmail).mockResolvedValue({ ok: true });

		await runEmailOutboxOnce();

		const row = getOutboxRow(applicationId);
		expect(row?.status).toBe('sent');
		expect(row?.attempts).toBe(0);
		const db = getDb();
		const appRow = db
			.prepare('SELECT approval_email_sent_at FROM applications WHERE id = ?')
			.get(applicationId) as { approval_email_sent_at: string | null };
		expect(appRow.approval_email_sent_at).not.toBeNull();
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

		enqueueApplicationApprovedEmail({
			applicationId,
			toEmail: record.email,
			toName: record.answers.name,
			callsign: record.answers.callsign,
			locale: record.locale
		});

		vi.mocked(sendApplicationApprovedEmail).mockResolvedValue({
			ok: false,
			error: 'send_failed',
			details: 'boom'
		});

		await runEmailOutboxOnce();

		const row = getOutboxRow(applicationId);
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

		const db = getDb();
		db.prepare(
			"INSERT INTO email_outbox (type, application_id, payload, status, attempts) VALUES ('application_approved', ?, ?, 'pending', 0)"
		).run(applicationId, '{not-json');

		await runEmailOutboxOnce();

		const row = getOutboxRow(applicationId);
		expect(row?.status).toBe('failed');
		expect(row?.last_error).toBe('invalid_payload');
		expect(sendApplicationApprovedEmail).not.toHaveBeenCalled();
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

		const payload = JSON.stringify({
			applicationId,
			toEmail: record.email,
			toName: record.answers.name,
			callsign: record.answers.callsign,
			locale: record.locale
		});
		const db = getDb();
		db.prepare(
			"INSERT INTO email_outbox (type, application_id, payload, status, attempts) VALUES ('application_approved', ?, ?, 'pending', 6)"
		).run(applicationId, payload);

		vi.mocked(sendApplicationApprovedEmail).mockResolvedValue({
			ok: false,
			error: 'send_failed',
			details: 'final'
		});

		await runEmailOutboxOnce();

		const row = getOutboxRow(applicationId);
		expect(row?.status).toBe('failed');
		expect(row?.last_error).toBe('send_failed');
	});
});
