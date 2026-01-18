'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import { applicationSchema } from '@/features/apply/schema';
import CallsignField from '@/features/callsign/ui/CallsignField';
import CallsignSearch from '@/features/callsign/ui/CallsignSearch';

const renameRequestSchema = z.object({
	callsign: applicationSchema.shape.callsign
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

	const canSubmit = !isSubmitting && !pending;

	const rules = useMemo(() => {
		return [
			tForm('callsignRules.allowedChars'),
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

			const json: unknown = await res.json().catch(() => null);
			const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

			if (res.status === 401) {
				setErrors(prev => ({ ...prev, general: t('errorNotSignedIn') }));
				return;
			}

			if (res.ok && isRecord(json) && json.ok === true) {
				setPending(true);
				setIsSubmitted(true);
				return;
			}

			const code = isRecord(json) && typeof json.error === 'string' ? json.error : '';
			if (code === 'rename_not_required') {
				setErrors(prev => ({ ...prev, general: t('errorRenameNotRequired') }));
				return;
			}
			if (code === 'duplicate_pending') {
				setPending(true);
				setErrors(prev => ({ ...prev, general: t('errorDuplicatePending') }));
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
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h2>
					<p className="mt-2 text-sm text-neutral-300">{t('subtitle')}</p>
				</div>
				<Link
					href={`/${props.locale}`}
					className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
				>
					{t('backHome')}
				</Link>
			</div>

			{(() => {
				const name = props.callsign || props.personaName || props.steamid64;
				return name ? (
					<p className="mt-2 text-xs text-neutral-500">{t('signedInAs', { name })}</p>
				) : null;
			})()}

			{props.renameRequiredReason ? (
				<div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
					<p className="text-sm font-medium text-neutral-100">{t('reasonLabel')}</p>
					<p className="mt-1 text-sm text-neutral-300">{props.renameRequiredReason}</p>
					{props.renameRequiredBySteamId64 ? (
						<p className="mt-2 text-xs text-neutral-500">
							{t('requestedByLabel')}: {props.renameRequiredByCallsign ?? props.renameRequiredBySteamId64}
						</p>
					) : null}
				</div>
			) : null}

			{pending ? (
				<div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
					<h3 className="text-sm font-semibold text-neutral-50">{t('pendingTitle')}</h3>
					<p className="mt-1 text-sm text-neutral-300">{t('pendingText')}</p>
					{isSubmitted ? <p className="mt-3 text-sm text-emerald-300">{t('successText')}</p> : null}
				</div>
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

					<div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4">
						<p className="text-sm font-medium text-neutral-100">{tForm('callsignSection.title')}</p>
						<p className="mt-1 text-sm text-neutral-300">{tForm('callsignSection.intro')}</p>
						<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
							{rules.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</div>

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
		</section>
	);
}
