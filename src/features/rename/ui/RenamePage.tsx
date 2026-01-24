'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import { callsignSchema } from '@/features/callsign/domain/callsignSchema';
import { parseRenameSubmitResponse } from '@/features/rename/domain/api';
import { CallsignField, CallsignSearch, type CallsignAvailabilityStatus } from '@/features/callsign/ui/root';
import {
	RenameHeader,
	RenamePendingPanel,
	RenameReasonPanel,
	RenameRulesPanel,
	RenameSurface
} from '@/features/rename/ui/root';

const renameRequestSchema = z.object({
	callsign: callsignSchema
});

type Props = {
	locale: string;
	callsign: string | null;
	personaName: string | null;
	steamid64: string;
	renameRequiredReason: string | null;
	renameRequiredBySteamId64: string | null;
	renameRequiredByCallsign: string | null;
	hasPendingRenameRequest: boolean;
};

export default function RenamePage(props: Props) {
	const t = useTranslations('rename');
	const tForm = useTranslations('form');

	const [callsign, setCallsign] = useState('');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [pending, setPending] = useState(props.hasPendingRenameRequest);
	const [availability, setAvailability] = useState<CallsignAvailabilityStatus>({ state: 'idle' });

	const translateIssue = (issue: ZodIssue) => {
		const params: Record<string, string | number | Date> = {};
		if (issue.code === 'too_small' && typeof issue.minimum === 'number') {
			params.min = issue.minimum;
		}
		if (issue.code === 'too_big' && typeof issue.maximum === 'number') {
			params.max = issue.maximum;
		}
		return tForm(`errors.${issue.message}`, params);
	};

	const hasExactConflict = availability.state === 'conflict' && availability.exactMatches.length > 0;
	const canSubmit = !isSubmitting && !pending && !hasExactConflict;

	const rules = useMemo(() => {
		return [
			tForm('callsignRules.allowedChars'),
			tForm('callsignRules.maxLength'),
			tForm('callsignRules.uniqueness'),
			tForm('callsignRules.noOffense'),
			tForm('callsignRules.neutral'),
			tForm('callsignRules.noProjectSquads'),
			tForm('callsignRules.noRealUnits'),
			tForm('callsignRules.noEquipment'),
			tForm('callsignRules.keepSimple'),
			tForm('callsignRules.adminNote')
		];
	}, [tForm]);

	const submit = async () => {
		setErrors(prev => {
			const next = { ...prev };
			delete next.general;
			delete next.callsign;
			return next;
		});

		const validation = renameRequestSchema.safeParse({ callsign });
		if (!validation.success) {
			const issue = validation.error.issues?.[0];
			setErrors(prev => ({
				...prev,
				callsign: issue ? translateIssue(issue) : tForm('errors.required')
			}));
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch('/api/rename', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ callsign: validation.data.callsign })
			});

			const parsed = parseRenameSubmitResponse(await res.json().catch(() => null));

			if (res.status === 401) {
				setErrors(prev => ({ ...prev, general: t('errorNotSignedIn') }));
				return;
			}

			if (res.ok && parsed?.kind === 'success') {
				setPending(true);
				setIsSubmitted(true);
				return;
			}

			const code = parsed?.kind === 'error' ? parsed.error : '';
			if (code === 'rename_not_required') {
				setErrors(prev => ({ ...prev, general: t('errorRenameNotRequired') }));
				return;
			}
			if (code === 'duplicate_pending') {
				setPending(true);
				setErrors(prev => ({ ...prev, general: t('errorDuplicatePending') }));
				return;
			}
			if (code === 'callsign_taken') {
				setErrors(prev => ({ ...prev, callsign: t('errorCallsignTaken') }));
				return;
			}

			setErrors(prev => ({ ...prev, general: t('errorServer') }));
		} catch {
			setErrors(prev => ({ ...prev, general: t('errorServer') }));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<RenameSurface>
			<RenameHeader
				title={t('title')}
				subtitle={t('subtitle')}
				backHref={`/${props.locale}`}
				backLabel={t('backHome')}
				signedInAs={(() => {
					const name = props.callsign || props.personaName || props.steamid64;
					return name ? t('signedInAs', { name }) : null;
				})()}
			/>

			{props.renameRequiredReason ? (
				<RenameReasonPanel
					reasonLabel={t('reasonLabel')}
					reason={props.renameRequiredReason}
					requestedByLabel={t('requestedByLabel')}
					requestedBy={props.renameRequiredByCallsign ?? props.renameRequiredBySteamId64 ?? null}
				/>
			) : null}

			{pending ? (
				<RenamePendingPanel
					title={t('pendingTitle')}
					text={t('pendingText')}
					successText={t('successText')}
					showSuccess={isSubmitted}
				/>
			) : (
				<form
					className="mt-6 grid gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}
				>
					<div>
						<h3 className="text-sm font-semibold text-neutral-50">{t('submitTitle')}</h3>
						<p className="mt-1 text-sm text-neutral-300">{t('submitText')}</p>
					</div>

					{errors.general ? <p className="text-sm text-red-400">{errors.general}</p> : null}

					<RenameRulesPanel
						title={tForm('callsignSection.title')}
						intro={tForm('callsignSection.intro')}
						rules={rules}
					/>

					<div className="grid gap-3">
						<CallsignField
							value={callsign}
							onChange={(v) => {
								setCallsign(v);
								setErrors(prev => {
									const next = { ...prev };
									delete next.callsign;
									return next;
								});
							}}
							onBlur={() => {
								const parsed = renameRequestSchema.shape.callsign.safeParse(callsign);
								if (!parsed.success) {
									const issue = parsed.error.issues?.[0];
									if (issue) setErrors(prev => ({ ...prev, callsign: translateIssue(issue) }));
								}
							}}
							onStatusChange={(s) => setAvailability(s)}
							error={errors.callsign}
						/>
						<CallsignSearch />
					</div>

					<button
						type="submit"
						disabled={!canSubmit}
						className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-black shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isSubmitting ? t('submitting') : t('submit')}
					</button>

				</form>
			)}
		</RenameSurface>
	);
}
