import {
	claimPendingEmailOutbox,
	markEmailOutboxFailed,
	markEmailOutboxGiveUp,
	markEmailOutboxSent,
	type ApprovalEmailPayload
} from './emailOutbox';
import { sendApplicationApprovedEmail } from '@/platform/email/brevo';
import { markApprovalEmailSent } from '@/features/apply/infra/sqliteApplications';
import { errorToLogObject, logger } from '@/platform/logger';

let started = false;

function parsePayload(raw: string): ApprovalEmailPayload | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as ApprovalEmailPayload;
	} catch {
		return null;
	}
}

const retryDelaysMs = [
	5 * 1000,
	5 * 60 * 1000,
	1 * 60 * 60 * 1000,
	3 * 60 * 60 * 1000,
	6 * 60 * 60 * 1000,
	24 * 60 * 60 * 1000
];

function computeNextAttempt(attempts: number): string | null {
	const index = attempts - 1;
	const delayMs = retryDelaysMs[index];
	if (!delayMs) return null;
	return new Date(Date.now() + delayMs).toISOString();
}

async function processBatch() {
	const rows = claimPendingEmailOutbox(10);
	if (rows.length === 0) return;

	for (const row of rows) {
		const payload = parsePayload(row.payload);
		if (!payload) {
			markEmailOutboxGiveUp(row.id, row.attempts + 1, 'invalid_payload', 'Failed to parse JSON payload');
			continue;
		}

		try {
			const result = await sendApplicationApprovedEmail(payload);
			if (result.ok) {
				markApprovalEmailSent(payload.applicationId);
				markEmailOutboxSent(row.id);
				continue;
			}

			const nextAttemptAt = computeNextAttempt(row.attempts + 1);
			if (!nextAttemptAt) {
				markEmailOutboxGiveUp(row.id, row.attempts + 1, result.error, result.details);
				continue;
			}
			markEmailOutboxFailed(row.id, row.attempts + 1, result.error, nextAttemptAt, result.details);
		} catch (error: unknown) {
			const details = JSON.stringify(errorToLogObject(error));
			logger.error({ ...errorToLogObject(error) }, 'email_outbox_send_failed');
			const nextAttemptAt = computeNextAttempt(row.attempts + 1);
			if (!nextAttemptAt) {
				markEmailOutboxGiveUp(row.id, row.attempts + 1, 'unexpected_error', details);
				continue;
			}
			markEmailOutboxFailed(row.id, row.attempts + 1, 'unexpected_error', nextAttemptAt, details);
		}
	}
}

export async function runEmailOutboxOnce() {
	await processBatch();
}

export function startEmailOutboxWorker() {
	if (started) return;
	if (process.env.NODE_ENV === 'test') return;
	started = true;

	const intervalMs = Number(process.env.EMAIL_OUTBOX_INTERVAL_MS ?? 5000);
	const timer = setInterval(() => {
		void processBatch();
	}, Number.isFinite(intervalMs) && intervalMs > 100 ? intervalMs : 5000);

	timer.unref?.();
	void processBatch();
}
