import { createHash } from 'node:crypto';
import {
	claimPendingEmailOutbox,
	markEmailOutboxFailed,
	markEmailOutboxGiveUp,
	markEmailOutboxSent,
	type OutboxEmailPayload
} from './emailOutbox';
import { sendOutboxEmail } from '@/platform/email/brevo';
import { createRequestId, errorToLogObject, logger } from '@/platform/logger';

let started = false;

function parsePayload<T>(raw: string): T | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as T;
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

function summarizeEmail(email?: string | null) {
	if (!email) return {};
	const normalized = email.trim().toLowerCase();
	const at = normalized.lastIndexOf('@');
	return {
		emailHash: createHash('sha1').update(normalized).digest('hex').slice(0, 12),
		emailDomain: at > 0 ? normalized.slice(at + 1) : undefined
	};
}

async function processBatch() {
	const batchId = createRequestId();
	const batchLog = logger.child({ requestId: batchId, worker: 'email_outbox' });
	const rows = claimPendingEmailOutbox(10);
	if (rows.length === 0) return;

	batchLog.info({ count: rows.length }, 'email_outbox_batch_claimed');

	for (const row of rows) {
		const rowLog = batchLog.child({
			outboxId: row.id,
			outboxType: row.type,
			attempts: row.attempts,
			userId: row.user_id ?? undefined
		});
		try {
			const sendStartedAt = Date.now();
			const payload = parsePayload<OutboxEmailPayload>(row.payload);
			if (!payload || !payload.toEmail || !payload.subject || !payload.textContent) {
				rowLog.warn('email_outbox_invalid_payload');
				markEmailOutboxGiveUp(
					row.id,
					row.attempts + 1,
					'invalid_payload',
					'Missing required email fields'
				);
				continue;
			}
			rowLog.debug({ ...summarizeEmail(payload.toEmail) }, 'email_outbox_send_start');
			const result = await sendOutboxEmail(payload);
			if (result.ok) {
				const markResult = markEmailOutboxSent(row.id);
				const durationMs = Date.now() - sendStartedAt;
				rowLog.info({ durationMs }, 'email_outbox_send_success');
				if (!markResult.success) {
					rowLog.error('email_outbox_mark_sent_failed');
				}
				continue;
			}

			const nextAttemptAt = computeNextAttempt(row.attempts + 1);
			if (!nextAttemptAt) {
				const markResult = markEmailOutboxGiveUp(
					row.id,
					row.attempts + 1,
					result.error,
					result.details
				);
				rowLog.warn({ error: result.error, details: result.details }, 'email_outbox_give_up');
				if (!markResult.success) {
					rowLog.error('email_outbox_mark_giveup_failed');
				}
				continue;
			}
			const markResult = markEmailOutboxFailed(
				row.id,
				row.attempts + 1,
				result.error,
				nextAttemptAt,
				result.details
			);
			rowLog.warn(
				{ error: result.error, nextAttemptAt, details: result.details },
				'email_outbox_send_failed'
			);
			if (!markResult.success) {
				rowLog.error('email_outbox_mark_failed_failed');
			}
		} catch (error: unknown) {
			const details = JSON.stringify(errorToLogObject(error));
			rowLog.error({ ...errorToLogObject(error) }, 'email_outbox_send_error');
			const nextAttemptAt = computeNextAttempt(row.attempts + 1);
			if (!nextAttemptAt) {
				const markResult = markEmailOutboxGiveUp(
					row.id,
					row.attempts + 1,
					'unexpected_error',
					details
				);
				rowLog.error({ details }, 'email_outbox_give_up');
				if (!markResult.success) {
					rowLog.error('email_outbox_mark_giveup_failed');
				}
				continue;
			}
			const markResult = markEmailOutboxFailed(
				row.id,
				row.attempts + 1,
				'unexpected_error',
				nextAttemptAt,
				details
			);
			rowLog.warn({ nextAttemptAt, details }, 'email_outbox_retry_scheduled');
			if (!markResult.success) {
				rowLog.error('email_outbox_mark_failed_failed');
			}
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
