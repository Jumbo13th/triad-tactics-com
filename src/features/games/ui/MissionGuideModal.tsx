'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { useTranslations } from 'next-intl';

const STORAGE_KEY = 'tt_mission_guide_dismissed';

function isDismissed(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

function setDismissed(): void {
	try {
		localStorage.setItem(STORAGE_KEY, '1');
	} catch {}
}

export function useMissionGuide() {
	const [open, setOpen] = useState(false);
	const [autoOpened, setAutoOpened] = useState(false);

	useEffect(() => {
		if (!isDismissed()) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setOpen(true);
			setAutoOpened(true);
		}
	}, []);

	return {
		open,
		autoOpened,
		show: () => { setAutoOpened(false); setOpen(true); },
		close: () => setOpen(false),
		dismiss: () => { setDismissed(); setOpen(false); }
	};
}

export function MissionGuideModal({
	open,
	onClose,
	onDismiss,
	showDismiss,
	t
}: {
	open: boolean;
	onClose: () => void;
	onDismiss: () => void;
	showDismiss: boolean;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const previousFocusRef = useRef<Element | null>(null);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			onClose();
			return;
		}
		if (e.key === 'Tab') {
			const dialog = dialogRef.current;
			if (!dialog) return;
			const focusable = dialog.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}
	}, [onClose]);

	useEffect(() => {
		if (!open) return;
		previousFocusRef.current = document.activeElement;
		dialogRef.current?.focus();
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			if (previousFocusRef.current instanceof HTMLElement) {
				previousFocusRef.current.focus();
			}
		};
	}, [open, handleKeyDown]);

	if (!open || typeof document === 'undefined') return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
			onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				tabIndex={-1}
				className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl outline-none sm:p-8"
			>
				<button
					type="button"
					className="absolute right-4 top-4 text-neutral-400 transition hover:text-neutral-100"
					onClick={onClose}
					aria-label={t('guideClose')}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>

				<h2 className="text-lg font-semibold text-neutral-50">{t('guideTitle')}</h2>
				<p className="mt-1 text-sm text-neutral-400">{t('guideIntro')}</p>

				<div className="mt-6 space-y-5">
					<GuideBlock title={t('guideProcessTitle')} body={t('guideProcessBody')} />
					<GuideBlock title={t('guideUnitTitle')} body={t('guideUnitBody')} accent="blue" />
					<GuideBlock title={t('guidePriorityTitle')} body={t('guidePriorityBody')} accent="amber" />
					<GuideBlock title={t('guideRegularTitle')} body={t('guideRegularBody')} accent="neutral" />
					<GuideBlock title={t('guidePasswordsTitle')} body={t('guidePasswordsBody')} />
					<GuideBlock title={t('guideServerPreparingTitle')} body={t('guideServerPreparingBody')} />
				</div>

				<div className={`mt-6 flex flex-wrap items-center ${showDismiss ? 'justify-between' : 'justify-end'} gap-3 border-t border-neutral-800 pt-5`}>
					{showDismiss ? (
						<button
							type="button"
							className="text-sm text-neutral-400 underline underline-offset-4 transition hover:text-neutral-200"
							onClick={onDismiss}
						>
							{t('guideDontShowAgain')}
						</button>
					) : null}
					<button
						type="button"
						className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800"
						onClick={onClose}
					>
						{t('guideClose')}
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
}

const accentMap = {
	blue: 'border-blue-500/30 bg-blue-500/10',
	amber: 'border-amber-500/30 bg-amber-500/10',
	neutral: 'border-neutral-700 bg-white/[0.03]'
} as const;

function GuideBlock({ title, body, accent }: { title: string; body: string; accent?: keyof typeof accentMap }) {
	const border = accent ? accentMap[accent] : 'border-neutral-800 bg-white/[0.03]';
	return (
		<div className={`rounded-2xl border ${border} px-4 py-3`}>
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">{title}</p>
			<p className="mt-2 whitespace-pre-line text-sm leading-7 text-neutral-200">{body}</p>
		</div>
	);
}
