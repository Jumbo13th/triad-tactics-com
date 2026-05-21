'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { armaGuidSchema } from '@/features/armaId/domain/armaGuidSchema';
import { parseArmaIdSubmitResponse } from '@/features/armaId/domain/api';

type Props = {
	label: string;
	currentValue: string | null;
	onSaved: () => void;
};

export function ArmaGuidEditField({ label, currentValue, onSaved }: Props) {
	const t = useTranslations('armaId');
	const tForm = useTranslations('form');

	const [showConfirm, setShowConfirm] = useState(false);
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(currentValue ?? '');
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const closeConfirm = useCallback(() => setShowConfirm(false), []);

	useEffect(() => {
		if (!showConfirm) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setShowConfirm(false);
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [showConfirm]);

	const startEditing = () => {
		setShowConfirm(false);
		setValue(currentValue ?? '');
		setError(null);
		setEditing(true);
	};

	const save = async () => {
		setError(null);

		const parsed = armaGuidSchema.safeParse(value);
		if (!parsed.success) {
			const issue = parsed.error.issues?.[0];
			setError(issue ? tForm(`errors.${issue.message}`) : tForm('errors.required'));
			return;
		}

		if (parsed.data === currentValue) {
			setEditing(false);
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch('/api/arma-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ armaGuid: parsed.data })
			});

			const result = parseArmaIdSubmitResponse(await res.json().catch(() => null));

			if (res.status === 401) {
				setError(t('errorNotSignedIn'));
				return;
			}

			if (res.ok && result?.kind === 'success') {
				setEditing(false);
				onSaved();
				return;
			}

			const code = result?.kind === 'error' ? result.error : '';
			if (code === 'duplicate') {
				setError(t('errorDuplicate'));
				return;
			}

			setError(t('errorServer'));
		} catch {
			setError(t('errorServer'));
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!editing) {
		return (
			<>
				<div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 shadow-sm shadow-black/10">
					<p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
					<p className="mt-1 text-sm text-neutral-100">{currentValue ?? tForm('errors.required')}</p>
					<button
						type="button"
						onClick={() => setShowConfirm(true)}
						className="mt-2 text-xs text-neutral-300 transition-colors hover:text-[color:var(--accent)]"
					>
						{t('edit')}
					</button>
				</div>

				{showConfirm ? (
					<div
						role="dialog"
						aria-modal="true"
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onClick={closeConfirm}
					>
						<div
							className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-xl shadow-black/40"
							onClick={(e) => e.stopPropagation()}
						>
							<h3 className="text-lg font-semibold text-neutral-50">{t('confirmTitle')}</h3>
							<p className="mt-3 text-sm leading-relaxed text-neutral-300">{t('confirmText')}</p>
							<div className="mt-6 flex gap-3">
								<button
									type="button"
									onClick={startEditing}
									className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
								>
									{t('confirmProceed')}
								</button>
								<button
									type="button"
									onClick={closeConfirm}
									className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
								>
									{t('confirmCancel')}
								</button>
							</div>
						</div>
					</div>
				) : null}
			</>
		);
	}

	return (
		<div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 shadow-sm shadow-black/10">
			<p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
			<div className="mt-2 grid gap-2">
				<input
					type="text"
					value={value}
					onChange={(e) => { setValue(e.target.value); setError(null); }}
					placeholder={t('fieldPlaceholder')}
					className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
					autoComplete="off"
					spellCheck={false}
				/>
				{error ? <p className="text-xs text-red-400">{error}</p> : null}
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => void save()}
						disabled={isSubmitting}
						className="rounded-md bg-[color:var(--accent)] px-3 py-1 text-xs font-medium text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isSubmitting ? t('saving') : t('save')}
					</button>
					<button
						type="button"
						onClick={() => { setEditing(false); setError(null); }}
						className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
					>
						{t('cancel')}
					</button>
				</div>
			</div>
		</div>
	);
}
