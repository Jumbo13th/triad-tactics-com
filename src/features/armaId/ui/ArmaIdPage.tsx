'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import { armaGuidSchema } from '@/features/armaId/domain/armaGuidSchema';
import { parseArmaIdSubmitResponse } from '@/features/armaId/domain/api';
import Link from 'next/link';

const formSchema = z.object({
	armaGuid: armaGuidSchema
});

type Props = {
	locale: string;
	callsign: string | null;
	personaName: string | null;
	steamid64: string;
};

export default function ArmaIdPage(props: Props) {
	const t = useTranslations('armaId');
	const tForm = useTranslations('form');

	const [armaGuid, setArmaGuid] = useState('');
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [fullscreenImage, setFullscreenImage] = useState<{ src: string; alt: string } | null>(null);

	const closeFullscreen = useCallback(() => setFullscreenImage(null), []);

	useEffect(() => {
		if (!fullscreenImage) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setFullscreenImage(null);
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [fullscreenImage]);

	const translateIssue = (issue: ZodIssue) => {
		return tForm(`errors.${issue.message}`);
	};

	const submit = async () => {
		setErrors({});

		const validation = formSchema.safeParse({ armaGuid });
		if (!validation.success) {
			const issue = validation.error.issues?.[0];
			setErrors(prev => ({
				...prev,
				armaGuid: issue ? translateIssue(issue) : tForm('errors.required')
			}));
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
				body: JSON.stringify({ armaGuid: validation.data.armaGuid })
			});

			const parsed = parseArmaIdSubmitResponse(await res.json().catch(() => null));

			if (res.status === 401) {
				setErrors(prev => ({ ...prev, general: t('errorNotSignedIn') }));
				return;
			}

			if (res.ok && parsed?.kind === 'success') {
				setIsSubmitted(true);
				return;
			}

			const code = parsed?.kind === 'error' ? parsed.error : '';
			if (code === 'duplicate') {
				setErrors(prev => ({ ...prev, armaGuid: t('errorDuplicate') }));
				return;
			}

			setErrors(prev => ({ ...prev, general: t('errorServer') }));
		} catch {
			setErrors(prev => ({ ...prev, general: t('errorServer') }));
		} finally {
			setIsSubmitting(false);
		}
	};

	const name = props.callsign || props.personaName || props.steamid64;

	return (
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h2>
					<p className="mt-2 text-sm text-neutral-300">{t('subtitle')}</p>
				</div>
			</div>
			{name ? (
				<p className="mt-2 text-xs text-neutral-500">{t('signedInAs', { name })}</p>
			) : null}

			<div className="mt-6 grid gap-4">
				<figure className="grid gap-2">
					<button
						type="button"
						onClick={() => setFullscreenImage({ src: '/arma-id/arma-id-01.png', alt: t('screenshot1Alt') })}
						className="block max-w-sm cursor-zoom-in overflow-hidden rounded-2xl border border-white/8"
					>
						<img src="/arma-id/arma-id-01.png" alt={t('screenshot1Alt')} className="w-full" />
					</button>
					<figcaption className="text-xs text-neutral-400">{t('screenshot1Caption')}</figcaption>
				</figure>
				<figure className="grid gap-2">
					<button
						type="button"
						onClick={() => setFullscreenImage({ src: '/arma-id/arma-id-02.png', alt: t('screenshot2Alt') })}
						className="block max-w-sm cursor-zoom-in overflow-hidden rounded-2xl border border-white/8"
					>
						<img src="/arma-id/arma-id-02.png" alt={t('screenshot2Alt')} className="w-full" />
					</button>
					<figcaption className="text-xs text-neutral-400">{t('screenshot2Caption')}</figcaption>
				</figure>
			</div>

			{isSubmitted ? (
				<div className="mt-6 grid gap-4">
					<p className="text-sm text-green-400">{t('successText')}</p>
					<Link
						href={`/${props.locale}`}
						className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-black shadow-sm hover:opacity-90"
					>
						{t('successLinkLabel')}
					</Link>
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
						<h3 className="text-sm font-semibold text-neutral-50">{t('formTitle')}</h3>
						<p className="mt-1 text-sm text-neutral-300">{t('formText')}</p>
					</div>

					{errors.general ? <p className="text-sm text-red-400">{errors.general}</p> : null}

					<div className="grid gap-1.5">
						<label htmlFor="armaGuid" className="text-sm font-medium text-neutral-200">
							{t('fieldLabel')}
						</label>
						<input
							id="armaGuid"
							type="text"
							value={armaGuid}
							onChange={(e) => {
								setArmaGuid(e.target.value);
								setErrors(prev => {
									const next = { ...prev };
									delete next.armaGuid;
									return next;
								});
							}}
							onBlur={() => {
								const parsed = formSchema.shape.armaGuid.safeParse(armaGuid);
								if (!parsed.success) {
									const issue = parsed.error.issues?.[0];
									if (issue) setErrors(prev => ({ ...prev, armaGuid: translateIssue(issue) }));
								}
							}}
							placeholder={t('fieldPlaceholder')}
							className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
							autoComplete="off"
							spellCheck={false}
						/>
						{errors.armaGuid ? (
							<p className="text-xs text-red-400">{errors.armaGuid}</p>
						) : null}
						<p className="text-xs text-neutral-500">{t('fieldHint')}</p>
					</div>

					<button
						type="submit"
						disabled={isSubmitting}
						className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-black shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isSubmitting ? t('submitting') : t('submit')}
					</button>
				</form>
			)}

			{fullscreenImage ? (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
					onClick={closeFullscreen}
				>
					<button
						type="button"
						aria-label="Close image"
						onClick={closeFullscreen}
						className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-neutral-300 transition-colors hover:bg-white/20 hover:text-white"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
					<img
						src={fullscreenImage.src}
						alt={fullscreenImage.alt}
						className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			) : null}
		</section>
	);
}
