'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import AvatarUploadField, { type PreparedAvatar } from './AvatarUploadField';

function useSundayTimeRange() {
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const fmt = (h: number) => {
		const d = new Date(Date.UTC(2026, 0, 4, h, 0));
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
	};
	return { from: fmt(16), to: fmt(21), tz };
}

export default function CreateUnitPage() {
	const t = useTranslations('units');
	const router = useRouter();
	const { from, to, tz } = useSundayTimeRange();

	const [name, setName] = useState('');
	const [tag, setTag] = useState('');
	const [description, setDescription] = useState('');
	const [memberNames, setMemberNames] = useState('');
	const [history, setHistory] = useState('');
	const [otherProjects, setOtherProjects] = useState('');
	const [acceptSunday, setAcceptSunday] = useState(false);
	const [acceptCommander, setAcceptCommander] = useState(false);
	const [avatar, setAvatar] = useState<PreparedAvatar | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	const canSubmit = useMemo(() =>
		name.trim().length >= 2 &&
		tag.trim().length >= 1 &&
		!!avatar &&
		memberNames.trim().length >= 10 &&
		history.trim().length >= 20 &&
		otherProjects.trim().length >= 5 &&
		acceptSunday &&
		acceptCommander,
	[name, tag, avatar, memberNames, history, otherProjects, acceptSunday, acceptCommander]);

	async function doSubmit() {
		setError(null);
		setSubmitting(true);
		setShowConfirm(false);

		try {
			const res = await fetch('/api/units', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					tag: tag.trim(),
					description: description.trim(),
					memberNames: memberNames.trim(),
					history: history.trim(),
					otherProjects: otherProjects.trim(),
					acceptSundaySchedule: acceptSunday,
					acceptSideCommanderRole: acceptCommander
				})
			});
			const data = await res.json();

			if (!res.ok) {
				const errorKey = data.error as string;
				setError(t(`errors.${errorKey}` as Parameters<typeof t>[0]));
				setSubmitting(false);
				return;
			}

			if (avatar) {
				const avatarRes = await fetch(`/api/units/${data.id}/avatar`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ data: avatar.data, mime: avatar.mime })
				});
				if (!avatarRes.ok) {
					await fetch(`/api/units/${data.id}`, { method: 'DELETE' }).catch(() => {});
					setError(t('errors.server_error'));
					setSubmitting(false);
					return;
				}
			}

			router.push(`/units/${tag.trim()}`);
		} catch {
			setError(t('errors.server_error'));
			setSubmitting(false);
		}
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		setShowConfirm(true);
	}

	const inputClass =
		'mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';

	return (
		<section className="grid gap-6">
			<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-8">
				<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
				<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
				<div className="relative">
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{t('title')}</p>
					<h2 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{t('createTitle')}</h2>
					<p className="max-w-2xl text-sm text-neutral-300 sm:text-base">{t('createSubtitle')}</p>
				</div>

				<div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

				<form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
					<div className="rounded-xl border border-amber-400/35 bg-amber-300/10 px-3 py-3">
						<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">{t('createNotice.title')}</p>
						<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-50/95">
							<li>{t('createNotice.noRename')}</li>
							<li>{t('createNotice.historyRequired')}</li>
							<li>{t('createNotice.incompleteDeleted')}</li>
						</ul>
					</div>

					<div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-5">
						<div>
							<p className="text-base font-semibold text-neutral-50">{t('section.profile')}</p>
							<p className="mt-1 text-sm text-neutral-400">{t('section.profileHint')}</p>
						</div>

						<div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
							<p className="text-sm font-medium text-neutral-200">{t('createRules.title')}</p>
							<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
								<li>{t('createRules.noOffense')}</li>
								<li>{t('createRules.noRealUnits')}</li>
								<li>{t('createRules.keepSimple')}</li>
								<li>{t('createRules.adminReview')}</li>
							</ul>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('nameLabel')} <span className="text-red-400">*</span>
							</label>
							<input
								type="text"
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder={t('namePlaceholder')}
								required
								minLength={2}
								maxLength={20}
								className={inputClass}
							/>
							<div className="mt-2 flex justify-between items-center">
								<p className="text-sm text-neutral-400">{t('nameHint')}</p>
								<p className={`text-sm shrink-0 ml-3 ${name.trim().length < 2 ? 'text-red-400' : 'text-neutral-500'}`}>
									{name.trim().length} / 20
								</p>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('tagLabel')} <span className="text-red-400">*</span>
							</label>
							<input
								type="text"
								value={tag}
								onChange={e => setTag(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
								placeholder={t('tagPlaceholder')}
								required
								minLength={1}
								maxLength={6}
								className={inputClass}
							/>
							<div className="mt-2 flex justify-between items-center">
								<p className="text-sm text-neutral-400">{t('tagHint')}</p>
								<p className={`text-sm shrink-0 ml-3 ${tag.trim().length < 1 ? 'text-red-400' : 'text-neutral-500'}`}>
									{tag.trim().length} / 6
								</p>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">{t('descriptionLabel')}</label>
							<textarea
								value={description}
								onChange={e => setDescription(e.target.value)}
								placeholder={t('descriptionPlaceholder')}
								maxLength={2000}
								rows={3}
								className={inputClass}
							/>
							<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('descriptionHint')}</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('avatar')} <span className="text-red-400">*</span>
							</label>
							<div className="mt-2">
								<AvatarUploadField
									alt={name.trim() || t('createTitle')}
									value={avatar}
									onValueChange={setAvatar}
								/>
							</div>
							<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('avatarHint')}</p>
						</div>
					</div>

					<div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-5">
						<div>
							<p className="text-base font-semibold text-neutral-50">{t('section.questionnaire')}</p>
							<p className="mt-1 text-sm text-neutral-400">{t('section.questionnaireHint')}</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('memberNamesLabel')} <span className="text-red-400">*</span>
							</label>
							<textarea
								value={memberNames}
								onChange={e => setMemberNames(e.target.value)}
								placeholder={t('memberNamesPlaceholder')}
								maxLength={2000}
								rows={4}
								className={inputClass}
							/>
							<div className="mt-2 flex justify-between items-center">
								<p className="text-sm text-neutral-400">{t('memberNamesHint')}</p>
								<p className={`text-sm shrink-0 ml-3 ${memberNames.trim().length < 10 ? 'text-red-400' : 'text-neutral-500'}`}>
									{memberNames.trim().length} / 10 min
								</p>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('historyLabel')} <span className="text-red-400">*</span>
							</label>
							<textarea
								value={history}
								onChange={e => setHistory(e.target.value)}
								placeholder={t('historyPlaceholder')}
								maxLength={4000}
								rows={5}
								className={inputClass}
							/>
							<div className="mt-2 flex justify-between items-center">
								<p className="text-sm text-neutral-400">{t('historyHint')}</p>
								<p className={`text-sm shrink-0 ml-3 ${history.trim().length < 20 ? 'text-red-400' : 'text-neutral-500'}`}>
									{history.trim().length} / 20 min
								</p>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-neutral-200">
								{t('otherProjectsLabel')} <span className="text-red-400">*</span>
							</label>
							<textarea
								value={otherProjects}
								onChange={e => setOtherProjects(e.target.value)}
								placeholder={t('otherProjectsPlaceholder')}
								maxLength={2000}
								rows={3}
								className={inputClass}
							/>
							<div className="mt-2 flex justify-between items-center">
								<p className="text-sm text-neutral-400">{t('otherProjectsHint')}</p>
								<p className={`text-sm shrink-0 ml-3 ${otherProjects.trim().length < 5 ? 'text-red-400' : 'text-neutral-500'}`}>
									{otherProjects.trim().length} / 5 min
								</p>
							</div>
						</div>
					</div>

					<div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
						<label className="flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								checked={acceptSunday}
								onChange={e => setAcceptSunday(e.target.checked)}
								className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
							/>
							<span className="text-sm leading-relaxed text-neutral-200">
								{t('acceptSunday', { from, to, tz })}
							</span>
						</label>
					</div>

					<div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
						<label className="flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								checked={acceptCommander}
								onChange={e => setAcceptCommander(e.target.checked)}
								className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
							/>
							<span className="text-sm leading-relaxed text-neutral-200">
								{t('acceptCommander')}
							</span>
						</label>
					</div>

					<div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-3">
						<p className="text-sm leading-relaxed text-red-100">{t('checkboxesRequired')}</p>
					</div>

					{error && <p className="text-sm text-red-400">{error}</p>}

					<div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{t('nextSteps.title')}</p>
						<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
							<li>{t('nextSteps.review')}</li>
							<li>{t('nextSteps.deleteIfBad')}</li>
							<li>{t('nextSteps.noGuaranteedSlots')}</li>
						</ul>
					</div>

					<div className="pt-2">
						<button
							type="submit"
							disabled={submitting || !canSubmit}
							className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-neutral-950 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{submitting ? t('editSaving') : t('create')}
						</button>
					</div>
				</form>
				</div>
			</div>

			{showConfirm && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={e => { if (e.target === e.currentTarget) setShowConfirm(false); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm font-semibold text-neutral-100">{t('confirmCreate.title')}</p>
							<p className="mt-2 text-sm text-neutral-400">{t('confirmCreate.body')}</p>
							<div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2">
								<p className="text-sm text-neutral-200">
									<span className="font-semibold">{t('nameLabel')}:</span> {name.trim()}
								</p>
								<p className="text-sm text-neutral-200">
									<span className="font-semibold">{t('tagLabel')}:</span> {tag.trim()}
								</p>
							</div>
							<p className="mt-2 text-sm text-amber-200">{t('confirmCreate.noRenameWarning')}</p>
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={() => setShowConfirm(false)}
								>
									{t('cancel')}
								</button>
								<button
									type="button"
									className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:opacity-90"
									onClick={doSubmit}
								>
									{t('confirmCreate.submit')}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}
		</section>
	);
}
