import type { SendMailingDeps } from '@/features/admin/ports';

type SendMailingInput = {
	applicationIds: number[];
	subjectEn: string;
	bodyEn: string;
	subjectRu: string;
	bodyRu: string;
};

type SendMailingResult =
	| {
			ok: true;
			total: number;
			queued: number;
			skippedNoEmail: number;
			skippedDuplicate: number;
	  }
	| { ok: false; error: 'database_error' };

export function sendMailing(deps: SendMailingDeps, input: SendMailingInput): SendMailingResult {
	const applications = deps.repo.getApplicationsByStatus('archived');
	const selectedIds = new Set(input.applicationIds);

	let total = 0;
	let queued = 0;
	let skippedNoEmail = 0;
	let skippedDuplicate = 0;

	for (const application of applications) {
		if (!application.confirmed_at) continue;
		if (!application.id || !selectedIds.has(application.id)) continue;
		total += 1;

		if (!application.email?.trim()) {
			skippedNoEmail += 1;
			continue;
		}
		if (application.user_id == null) {
			return { ok: false, error: 'database_error' };
		}

		const useRuTemplate = application.locale === 'ru' || application.locale === 'uk';
		const subjectTemplate = useRuTemplate ? input.subjectRu : input.subjectEn;
		const bodyTemplate = useRuTemplate ? input.bodyRu : input.bodyEn;

		const { subject, textContent } = deps.email.buildApprovedBroadcastContent({
			toEmail: application.email,
			toName: application.answers?.name ?? undefined,
			callsign: application.answers?.callsign ?? undefined,
			locale: application.locale ?? undefined,
			subjectTemplate,
			bodyTemplate
		});

		const signature = '— Triad Tactics';
		const textContentWithSignature = textContent.includes(signature)
			? textContent
			: [textContent.trim(), signature].filter((line) => line.length > 0).join('\n\n');

		const result = deps.outbox.enqueueOutboxEmail({
			userId: application.user_id,
			type: 'approved_broadcast',
			payload: {
				toEmail: application.email,
				toName: application.answers?.name ?? undefined,
				subject,
				textContent: textContentWithSignature,
				tags: ['approved-broadcast']
			}
		});

		if (result.success) {
			queued += 1;
			continue;
		}

		if (result.error === 'duplicate') {
			skippedDuplicate += 1;
			continue;
		}

		return { ok: false, error: 'database_error' };
	}

	return { ok: true, total, queued, skippedNoEmail, skippedDuplicate };
}
