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

	const queued = deps.outbox.enqueueApplicationApproved({
		applicationId: application.id ?? input.applicationId,
		toEmail: application.email,
		toName: application.answers?.name || undefined,
		callsign: application.answers?.callsign || undefined,
		locale: application.locale ?? undefined,
		renameRequired: input.renameRequired ?? false
	});

	if (!queued.success && queued.error !== 'duplicate') {
		return { ok: false, error: 'database_error' };
	}

	return { ok: true };
}
