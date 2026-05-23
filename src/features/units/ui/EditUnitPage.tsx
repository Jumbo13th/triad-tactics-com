'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import AvatarUploadField from './AvatarUploadField';

type Unit = {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	leaderUserId: number | null;
	leaderCallsign: string | null;
	memberCount: number;
	avatarMime: string | null;
	updatedAt: string;
};

type UnitMembership = {
	id: number;
	unitId: number;
	userId: number;
	callsign: string | null;
	role: string;
	message: string;
};

type ViewerContext = {
	isMember: boolean;
	isApplicant: boolean;
	isLeader: boolean;
	isDeputy: boolean;
	isAdmin: boolean;
};

export default function EditUnitPage({ unitId }: { unitId: number }) {
	const t = useTranslations('units');
	const router = useRouter();
	const [unit, setUnit] = useState<Unit | null>(null);
	const [members, setMembers] = useState<UnitMembership[]>([]);
	const [viewer, setViewer] = useState<ViewerContext>({ isMember: false, isApplicant: false, isLeader: false, isDeputy: false, isAdmin: false });
	const [loading, setLoading] = useState(true);

	const [description, setDescription] = useState('');
	const [joinMessage, setJoinMessage] = useState('');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [pendingConfirm, setPendingConfirm] = useState<{ title: string; text: string; action: () => void } | null>(null);

	const loadUnit = useCallback(() => {
		fetch(`/api/units/${unitId}`)
			.then(r => r.json())
			.then(data => {
				if (data.unit) {
					setUnit(data.unit);
					setMembers(data.members ?? []);
					setViewer(data.viewer ?? { isMember: false, isApplicant: false, isLeader: false, isDeputy: false, isAdmin: false });
					setDescription(data.unit.description);
					setJoinMessage(data.unit.joinMessage ?? '');
				}
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [unitId]);

	useEffect(() => { loadUnit(); }, [loadUnit]);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaveError(null);
		setSaveSuccess(false);
		setSaving(true);
		try {
			const res = await fetch(`/api/units/${unitId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ description: description.trim(), joinMessage: joinMessage.trim() })
			});
			const data = await res.json();
			if (!res.ok) {
				setSaveError(t(`errors.${data.error}` as Parameters<typeof t>[0]));
				setSaving(false);
				return;
			}
			setSaveSuccess(true);
			loadUnit();
		} catch {
			setSaveError(t('errors.server_error'));
		} finally {
			setSaving(false);
		}
	}

	async function handleMemberAction(userId: number, action: string, role?: string) {
		setActionError(null);
		try {
			const payload: Record<string, unknown> = { userId, action };
			if (role) payload.role = role;
			const res = await fetch(`/api/units/${unitId}/members`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const data = await res.json();
				setActionError(data.error ?? 'Error');
				return;
			}
			loadUnit();
		} catch {
			setActionError(t('errors.server_error'));
		}
	}

	async function handleDeleteUnit() {
		setActionError(null);
		try {
			const res = await fetch(`/api/units/${unitId}`, { method: 'DELETE' });
			if (!res.ok) {
				const data = await res.json();
				setActionError(t(`errors.${data.error}` as Parameters<typeof t>[0]));
				return;
			}
			router.push('/units');
		} catch {
			setActionError(t('errors.server_error'));
		}
	}

	async function handleTransferLeadership(userId: number) {
		setActionError(null);
		try {
			const res = await fetch(`/api/units/${unitId}/transfer-leadership`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId })
			});
			if (!res.ok) {
				const data = await res.json();
				setActionError(data.error ?? 'Error');
				return;
			}
			loadUnit();
		} catch {
			setActionError(t('errors.server_error'));
		}
	}

	if (loading) return <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>;
	if (!unit) return <p className="py-8 text-center text-sm text-neutral-500">{t('errors.not_found')}</p>;
	if (!viewer.isLeader && !viewer.isDeputy) return <p className="py-8 text-center text-sm text-neutral-500">{t('errors.forbidden')}</p>;

	const membersList = members.filter(m => m.role === 'member' || m.role === 'deputy');
	const applicantsList = members.filter(m => m.role === 'applicant');

	const inputClass =
		'mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';

	return (
		<section className="grid gap-6">
			<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
				<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
				<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
				<div className="relative grid gap-4">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{t('editTitle')}</p>
					<div className="flex flex-wrap items-center gap-3">
						<span className="inline-flex items-center rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1.5 text-sm font-bold tracking-widest text-[color:var(--accent)]">
							{unit.tag}
						</span>
						<Link href={`/units/${unit.tag}`} className="text-2xl font-semibold tracking-tight text-neutral-50 transition hover:text-[color:var(--accent)] sm:text-3xl">
							{unit.name}
						</Link>
					</div>
				</div>
			</div>

			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('avatar')}</p>
				<div className="mt-4">
					<AvatarUploadField
						alt={unit.name}
						imageUrl={unit.avatarMime ? `/api/units/${unitId}/avatar?v=${encodeURIComponent(unit.updatedAt)}` : null}
						uploadUrl={`/api/units/${unitId}/avatar`}
						deleteUrl={`/api/units/${unitId}/avatar`}
						onUploaded={loadUnit}
						onDeleted={loadUnit}
					/>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-neutral-400">{t('avatarHint')}</p>
			</div>

			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('editInfoSection')}</p>

				<form onSubmit={handleSave} className="mt-4 space-y-6" noValidate>
					<div>
						<label className="block text-sm font-medium text-neutral-200">{t('descriptionLabel')}</label>
						<textarea
							value={description}
							onChange={e => setDescription(e.target.value)}
							placeholder={t('descriptionPlaceholder')}
							maxLength={2000}
							rows={4}
							className={inputClass}
						/>
						<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('descriptionHint')}</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-neutral-200">{t('joinMessageLabel')}</label>
						<textarea
							value={joinMessage}
							onChange={e => setJoinMessage(e.target.value)}
							placeholder={t('joinMessagePlaceholder')}
							maxLength={2000}
							rows={3}
							className={inputClass}
						/>
						<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('joinMessageHint')}</p>
					</div>

					{saveError && <p className="text-sm text-red-400">{saveError}</p>}
					{saveSuccess && <p className="text-sm text-green-400">{t('editSaved')}</p>}

					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{saving ? t('editSaving') : t('save')}
					</button>
				</form>
			</div>

			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
					{t('members')} ({membersList.length})
				</p>
				{actionError && <p className="mt-2 text-sm text-red-400">{actionError}</p>}
				<div className="mt-4 grid gap-3">
					{[...membersList].sort((a, b) => (unit.leaderUserId === b.userId ? 1 : 0) - (unit.leaderUserId === a.userId ? 1 : 0)).map(m => (
						<div key={m.id} className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3">
							<div className="flex items-center gap-3">
								<span className="text-sm font-medium text-neutral-200">{m.callsign ?? '—'}</span>
								{unit.leaderUserId === m.userId && (
									<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2.5 py-0.5 text-xs font-semibold text-[color:var(--accent)]">
										{t('commander')}
									</span>
								)}
								{m.role === 'deputy' && unit.leaderUserId !== m.userId && (
									<span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
										{t('deputy')}
									</span>
								)}
							</div>
							{m.userId !== unit.leaderUserId && (viewer.isLeader || (viewer.isDeputy && m.role !== 'deputy')) && (
								<div className="flex gap-2">
									{viewer.isLeader && (
										<>
											<button
												type="button"
												onClick={() => setPendingConfirm({ title: t('transferLeadership'), text: t('confirmTransfer'), action: () => handleTransferLeadership(m.userId) })}
												className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800"
											>
												{t('transferLeadership')}
											</button>
											{m.role === 'deputy' ? (
												<button
													type="button"
													onClick={() => handleMemberAction(m.userId, 'set_role', 'member')}
													className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-yellow-400 transition hover:bg-neutral-800"
												>
													{t('demoteDeputy')}
												</button>
											) : (
												<button
													type="button"
													onClick={() => handleMemberAction(m.userId, 'set_role', 'deputy')}
													className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-purple-400 transition hover:bg-neutral-800"
												>
													{t('promoteDeputy')}
												</button>
											)}
										</>
									)}
									<button
										type="button"
										onClick={() => setPendingConfirm({ title: t('actions.remove'), text: t('confirmRemove'), action: () => handleMemberAction(m.userId, 'remove') })}
										className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-neutral-800"
									>
										{t('actions.remove')}
									</button>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{applicantsList.length > 0 && (
				<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
						{t('applicants')} ({applicantsList.length})
					</p>
					<div className="mt-4 grid gap-3">
						{applicantsList.map(m => (
							<div key={m.id} className="rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-neutral-200">{m.callsign ?? '—'}</span>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => handleMemberAction(m.userId, 'approve')}
											className="inline-flex items-center rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90"
										>
											{t('actions.approve')}
										</button>
										<button
											type="button"
											onClick={() => setPendingConfirm({ title: t('actions.reject'), text: t('confirmReject'), action: () => handleMemberAction(m.userId, 'reject') })}
											className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-neutral-800"
										>
											{t('actions.reject')}
										</button>
									</div>
								</div>
								{m.message && (
									<p className="mt-2 whitespace-pre-line text-sm text-neutral-400">{m.message}</p>
								)}
							</div>
						))}
					</div>
				</div>
			)}
			{viewer.isLeader && (
				<div className="rounded-2xl border border-red-500/20 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">{t('deleteUnitSection')}</p>
					<p className="mt-2 text-sm text-neutral-400">{t('deleteUnitWarning')}</p>
					<button
						type="button"
						onClick={() => setShowDeleteModal(true)}
						className="mt-4 inline-flex items-center rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
					>
						{t('actions.delete')}
					</button>
				</div>
			)}

			{pendingConfirm && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={e => { if (e.target === e.currentTarget) setPendingConfirm(null); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm font-semibold text-neutral-100">{pendingConfirm.title}</p>
							<p className="mt-2 text-sm text-neutral-400">{pendingConfirm.text}</p>
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={() => setPendingConfirm(null)}
								>
									{t('cancel')}
								</button>
								<button
									type="button"
									className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/25"
									onClick={() => { pendingConfirm.action(); setPendingConfirm(null); }}
								>
									{pendingConfirm.title}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}

			{showDeleteModal && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm font-semibold text-neutral-100">{t('deleteUnitSection')}</p>
							<p className="mt-2 text-sm text-neutral-400">{t('confirmDelete')}</p>
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={() => setShowDeleteModal(false)}
								>
									{t('cancel')}
								</button>
								<button
									type="button"
									className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/25"
									onClick={() => {
										setShowDeleteModal(false);
										handleDeleteUnit();
									}}
								>
									{t('actions.delete')}
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
