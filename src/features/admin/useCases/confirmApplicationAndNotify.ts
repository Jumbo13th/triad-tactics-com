import type { ConfirmApplicationAndNotifyDeps } from '../ports';

export type ConfirmApplicationAndNotifyResult =
	| { ok: true }
	| { ok: false; error: 'not_found' | 'database_error' };

export async function confirmApplicationAndNotify(
	deps: ConfirmApplicationAndNotifyDeps,
	input: { applicationId: number; confirmedBySteamId64: string; renameRequired?: boolean }
): Promise<ConfirmApplicationAndNotifyResult> {
	const application = deps.applications.getApplicationById(input.applicationId);
	const shouldNotify = !!application?.email && !application?.approval_email_sent_at;

	const result = deps.repo.confirmApplication(input.applicationId, input.confirmedBySteamId64);
	if (!result.success) return { ok: false, error: result.error };

	if (!application || !shouldNotify) return { ok: true };
	if (application.user_id == null) return { ok: false, error: 'database_error' };

	const { subject, textContent } = await deps.email.buildApprovalContent({
		toEmail: application.email,
		toName: application.answers?.name || undefined,
		callsign: application.answers?.callsign || undefined,
		locale: application.locale ?? undefined,
		renameRequired: input.renameRequired ?? false
	});

	const queued = deps.outbox.enqueueOutboxEmail({
		userId: application.user_id,
		type: 'application_approved',
		payload: {
			toEmail: application.email,
			toName: application.answers?.name || undefined,
			subject,
			textContent,
			tags: ['application-approved']
		}
	});

	if (!queued.success && queued.error !== 'duplicate') {
		return { ok: false, error: 'database_error' };
	}

	const markResult = deps.applications.markApprovalEmailSent(application.id ?? input.applicationId);
	if (!markResult.success) {
		return { ok: false, error: 'database_error' };
	}

	return { ok: true };
}
