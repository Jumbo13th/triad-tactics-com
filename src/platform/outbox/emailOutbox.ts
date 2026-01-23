import { getDb } from '@/platform/db/connection';

export type ApprovalEmailPayload = {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
	applicationId: number;
};

export type EmailOutboxRow = {
	id: number;
	type: 'application_approved';
	application_id: number | null;
	payload: string;
	attempts: number;
	last_error: string | null;
};

type EnqueueResult =
	| { success: true }
	| { success: false; error: 'duplicate' | 'database_error' };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function enqueueApplicationApprovedEmail(payload: ApprovalEmailPayload): EnqueueResult {
	const db = getDb();
	const stmt = db.prepare(`
		INSERT INTO email_outbox (type, application_id, payload, status)
		VALUES (?, ?, ?, 'pending')
	`);

	try {
		stmt.run('application_approved', payload.applicationId, JSON.stringify(payload));
		return { success: true };
	} catch (error: unknown) {
		const code = isRecord(error) && typeof error.code === 'string' ? (error.code as string) : '';
		if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
			return { success: false, error: 'duplicate' };
		}
		return { success: false, error: 'database_error' };
	}
}

export function claimPendingEmailOutbox(limit: number): EmailOutboxRow[] {
	const db = getDb();
	const now = new Date().toISOString();
	const selectStmt = db.prepare(`
		SELECT id, type, application_id, payload, attempts, last_error
		FROM email_outbox
		WHERE status = 'pending'
			AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
		ORDER BY id ASC
		LIMIT ?
	`);
	const markStmt = db.prepare(`
		UPDATE email_outbox
		SET status = 'processing', processing_at = ?, updated_at = ?
		WHERE id = ? AND status = 'pending'
	`);

	const run = db.transaction(() => {
		const batch = selectStmt.all(now, limit) as EmailOutboxRow[];
		const claimed: EmailOutboxRow[] = [];
		for (const row of batch) {
			const result = markStmt.run(now, now, row.id);
			if (result.changes > 0) claimed.push(row);
		}
		return claimed;
	});

	return run();
}

export function markEmailOutboxSent(id: number) {
	const db = getDb();
	const stmt = db.prepare(`
		UPDATE email_outbox
		SET status = 'sent',
			sent_at = CURRENT_TIMESTAMP,
			last_error = NULL,
			last_error_details = NULL,
			next_attempt_at = NULL,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`);
	try {
		stmt.run(id);
		return { success: true as const };
	} catch {
		return { success: false as const };
	}
}

export function markEmailOutboxFailed(
	id: number,
	attempts: number,
	error: string,
	nextAttemptAt: string | null,
	details?: string | null
) {
	const db = getDb();
	const stmt = db.prepare(`
		UPDATE email_outbox
		SET status = 'pending',
			attempts = ?,
			last_error = ?,
			last_error_details = ?,
			next_attempt_at = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`);
	try {
		stmt.run(attempts, error, details ?? null, nextAttemptAt, id);
		return { success: true as const };
	} catch {
		return { success: false as const };
	}
}

export function markEmailOutboxGiveUp(
	id: number,
	attempts: number,
	error: string,
	details?: string | null
) {
	const db = getDb();
	const stmt = db.prepare(`
		UPDATE email_outbox
		SET status = 'failed',
			attempts = ?,
			last_error = ?,
			last_error_details = ?,
			next_attempt_at = NULL,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`);
	try {
		stmt.run(attempts, error, details ?? null, id);
		return { success: true as const };
	} catch {
		return { success: false as const };
	}
}
