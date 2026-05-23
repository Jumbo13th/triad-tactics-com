'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { formatLocalizedDateTime } from '@/platform/dateTime';

type Unit = {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	avatarMime: string | null;
	leaderCallsign: string | null;
	slotsAllocated: number;
	memberCount: number;
	applicantCount: number;
	joinMessage: string;
	updatedAt: string;
};

type UnitMembership = {
	id: number;
	unitId: number;
	userId: number;
	callsign: string | null;
	steamid64: string | null;
	role: string;
	message: string;
	createdAt: string;
};

type ViewerContext = {
	isMember: boolean;
	isApplicant: boolean;
	isLeader: boolean;
	isDeputy: boolean;
	isAdmin: boolean;
	hasUnitElsewhere: boolean;
	membership: { message: string } | null;
};

type UnitEvent = {
	id: number;
	kind: string;
	actorCallsign: string | null;
	targetCallsign: string | null;
	meta: string | null;
	createdAt: string;
};

function resolveEventKind(kind: string): string {
	if (kind === 'unverify' || kind === 'verification_removed') return 'unverified';
	if (kind === 'verify' || kind === 'verification_added') return 'verified';
	return kind;
}

type RotationSideInfo = { sideName: string; sideColor: string } | null;

export default function UnitDetailPage({ unitId, rotationSide = null }: { unitId: number; rotationSide?: RotationSideInfo }) {
	const t = useTranslations('units');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const [unit, setUnit] = useState<Unit | null>(null);
	const [members, setMembers] = useState<UnitMembership[]>([]);
	const [events, setEvents] = useState<UnitEvent[]>([]);
	const [viewer, setViewer] = useState<ViewerContext>({ isMember: false, isApplicant: false, isLeader: false, isDeputy: false, isAdmin: false, hasUnitElsewhere: false, membership: null });
	const [loading, setLoading] = useState(true);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionSuccess, setActionSuccess] = useState<string | null>(null);
	const [showApplyModal, setShowApplyModal] = useState(false);
	const [applyMessage, setApplyMessage] = useState('');
	const [pendingConfirm, setPendingConfirm] = useState<{ title: string; text: string; action: () => void } | null>(null);

	const loadUnit = useCallback(() => {
		fetch(`/api/units/${unitId}`)
			.then(r => r.json())
			.then(data => {
				if (data.unit) {
					setUnit(data.unit);
					setMembers(data.members ?? []);
					setEvents(data.events ?? []);
					setViewer(data.viewer ?? { isMember: false, isApplicant: false, isLeader: false, isDeputy: false, isAdmin: false, hasUnitElsewhere: false, membership: null });
				}
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [unitId]);

	useEffect(() => { loadUnit(); }, [loadUnit]);

	async function handleAction(url: string, body?: object) {
		setActionError(null);
		setActionSuccess(null);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: body ? { 'content-type': 'application/json' } : {},
				body: body ? JSON.stringify(body) : undefined
			});
			const data = await res.json();
			if (!res.ok) {
				const errorKey = (data.error as string) || 'server_error';
				setActionError(t(`errors.${errorKey}` as Parameters<typeof t>[0]));
				return;
			}
			loadUnit();
			return data;
		} catch {
			setActionError(t('errors.server_error'));
		}
	}

	if (loading) return <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>;
	if (!unit) return <p className="py-8 text-center text-sm text-neutral-500">{t('errors.not_found')}</p>;

	const membersList = members.filter(m => m.role === 'member' || m.role === 'deputy' || m.role === 'leader');
	const applicantsList = members.filter(m => m.role === 'applicant');

	return (
		<section className="grid gap-6">
			<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
				<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
				<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl" aria-hidden="true" />
				<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
				<div className="relative grid gap-4">
					<div className="flex items-start gap-4">
						{unit.avatarMime && (
							<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-neutral-900 p-2 ring-1 ring-neutral-800 sm:h-24 sm:w-24">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={`/api/units/${unitId}/avatar?v=${encodeURIComponent(unit.updatedAt)}`}
									alt={unit.name}
									loading="lazy"
									decoding="async"
									className="h-full w-full rounded-lg object-contain opacity-0 transition-opacity duration-300"
									onLoad={e => { (e.target as HTMLImageElement).classList.remove('opacity-0'); }}
								/>
							</div>
						)}
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-3">
								<span className="inline-flex items-center rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1.5 text-sm font-bold tracking-widest text-[color:var(--accent)]">
									{unit.tag}
								</span>
								<span className={
									'inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-bold tracking-widest ' +
									(unit.status === 'verified' ? 'border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]' :
									 'border border-neutral-800 bg-white/5 text-neutral-400')
								}>
									{t(`status.${unit.status}` as Parameters<typeof t>[0])}
								</span>
							</div>
							<h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">{unit.name}</h2>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
						{rotationSide && (
							<Link
								href="/games#rotation"
								className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition hover:opacity-80"
								style={{
									backgroundColor: `${rotationSide.sideColor}15`,
									borderWidth: 1,
									borderColor: `${rotationSide.sideColor}40`,
									color: rotationSide.sideColor,
								}}
							>
								<span className="h-2 w-2 rounded-full" style={{ backgroundColor: rotationSide.sideColor }} />
								{rotationSide.sideName}
							</Link>
						)}
						{unit.leaderCallsign && (
							<div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs font-semibold text-neutral-300">
								{t('commander')}: {unit.leaderCallsign}
							</div>
						)}
						<div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs font-semibold text-neutral-300">
							{t('members')}: {unit.memberCount}
						</div>
						{unit.slotsAllocated > 0 && (
							<div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs font-semibold text-neutral-300">
								{t('slotsAllocated')}: {unit.slotsAllocated}
							</div>
						)}
					</div>

					{unit.description && (
						<>
							<div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
							<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
								<p className="max-w-4xl text-sm text-neutral-200">{unit.description}</p>
							</div>
						</>
					)}

					<div className="flex flex-wrap gap-2">
						{(viewer.isLeader || viewer.isDeputy) && (
							<Link
								href={`/units/${unit.tag}/edit`}
								className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10"
							>
								{t('edit')}
							</Link>
						)}
						{!viewer.isMember && !viewer.isApplicant && !viewer.hasUnitElsewhere && unit.status === 'verified' && (
							<button
								type="button"
								onClick={() => { setApplyMessage(''); setShowApplyModal(true); }}
								className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:opacity-90"
							>
								{t('apply')}
							</button>
						)}
						{viewer.isApplicant && (
							<>
								<span className="inline-flex items-center rounded-full border border-yellow-800/40 bg-yellow-900/20 px-3 py-1.5 text-sm font-semibold text-yellow-400">
									{t('applicationPending')}
								</span>
								<button
									type="button"
									onClick={() => setPendingConfirm({ title: t('withdrawApplication'), text: t('confirmWithdraw'), action: () => handleAction(`/api/units/${unitId}/leave`) })}
									className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10"
								>
									{t('withdrawApplication')}
								</button>
							</>
						)}
						{viewer.isMember && !viewer.isLeader && (
							<button
								type="button"
								onClick={() => setPendingConfirm({ title: t('leave'), text: t('confirmLeave'), action: () => handleAction(`/api/units/${unitId}/leave`) })}
								className="inline-flex min-h-11 items-center rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
							>
								{t('leave')}
							</button>
						)}
					</div>

					{viewer.isApplicant && (
						<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
							<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('yourApplication')}</p>
							{viewer.membership?.message ? (
								<p className="mt-2 whitespace-pre-line text-sm text-neutral-300">{viewer.membership.message}</p>
							) : (
								<p className="mt-2 text-sm text-neutral-500">{t('applicationNoMessage')}</p>
							)}
						</div>
					)}

					{actionError && <p className="text-sm text-red-400">{actionError}</p>}
					{actionSuccess && <p className="text-sm text-green-400">{actionSuccess}</p>}
				</div>
			</div>

			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
					{t('members')} ({membersList.length})
				</p>
				<div className="mt-4 grid gap-3">
					{[...membersList].sort((a, b) => (b.role === 'leader' ? 1 : 0) - (a.role === 'leader' ? 1 : 0)).map(m => (
						<div key={m.id} className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3">
							<div className="flex items-center gap-3">
								<span className="text-sm font-medium text-neutral-200">{m.callsign ?? '—'}</span>
								{m.role === 'leader' && (
									<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2.5 py-0.5 text-xs font-semibold text-[color:var(--accent)]">
										{t('commander')}
									</span>
								)}
								{m.role === 'deputy' && (
									<span className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
										{t('deputy')}
									</span>
								)}
							</div>
							{(viewer.isLeader || (viewer.isDeputy && m.role !== 'deputy')) && m.role !== 'leader' && (
								<button
									type="button"
									onClick={() => setPendingConfirm({ title: t('actions.remove'), text: t('confirmRemove'), action: () => handleAction(`/api/units/${unitId}/members`, { userId: m.userId, action: 'remove' }) })}
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-neutral-800"
								>
									{t('actions.remove')}
								</button>
							)}
						</div>
					))}
				</div>
			</div>

			{(viewer.isLeader || viewer.isDeputy) && applicantsList.length > 0 && (
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
											onClick={() => handleAction(`/api/units/${unitId}/members`, { userId: m.userId, action: 'approve' })}
											className="inline-flex items-center rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90"
										>
											{t('actions.approve')}
										</button>
										<button
											type="button"
											onClick={() => setPendingConfirm({ title: t('actions.reject'), text: t('confirmReject'), action: () => handleAction(`/api/units/${unitId}/members`, { userId: m.userId, action: 'reject' }) })}
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

			{events.length > 0 && (
				<details className="group rounded-2xl border border-neutral-800 bg-neutral-950 shadow-sm shadow-black/20">
					<summary className="flex cursor-pointer list-none items-center justify-between p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
						<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
							{t('history')}
						</p>
						<svg
							className="ml-3 h-5 w-5 shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
							aria-hidden="true"
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
						</svg>
					</summary>
					<div className="border-t border-neutral-800 px-5 pb-5 sm:px-6 sm:pb-6">
						<div className="mt-4 space-y-0">
							{events.map((ev, i) => (
								<div key={ev.id} className="flex gap-4">
									<div className="flex w-4 shrink-0 flex-col items-center">
										<div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-600" />
										{i < events.length - 1 && <div className="w-px flex-1 bg-neutral-800" />}
									</div>
									<div className="pb-4">
										<p className="text-sm text-neutral-200">
											{t(`event.${resolveEventKind(ev.kind)}` as Parameters<typeof t>[0], {
												actor: ev.actorCallsign ?? '—',
												target: ev.targetCallsign ?? '—',
												meta: ev.meta ?? ''
											})}
										</p>
										<p className="mt-0.5 text-xs text-neutral-500">
											{formatLocalizedDateTime(ev.createdAt, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? ev.createdAt}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</details>
			)}

			{pendingConfirm && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={e => { if (e.target === e.currentTarget) setPendingConfirm(null); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl">
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

			{showApplyModal && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={e => { if (e.target === e.currentTarget) setShowApplyModal(false); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm font-semibold text-neutral-100">{t('applyModal.title')}</p>
							{unit?.joinMessage && (
								<div className="mt-3 rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/5 px-3 py-3">
									<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">{t('joinMessageTitle')}</p>
									<p className="mt-1 whitespace-pre-line text-sm text-neutral-200">{unit.joinMessage}</p>
								</div>
							)}
							<div className="mt-3">
								<label className="block text-sm font-medium text-neutral-300">{t('applyModal.messageLabel')}</label>
								<textarea
									value={applyMessage}
									onChange={e => setApplyMessage(e.target.value)}
									placeholder={t('applyModal.messagePlaceholder')}
									maxLength={2000}
									rows={4}
									className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 placeholder-neutral-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
								/>
							</div>
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={() => setShowApplyModal(false)}
								>
									{t('cancel')}
								</button>
								<button
									type="button"
									className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:opacity-90"
									onClick={() => {
										setShowApplyModal(false);
										handleAction(`/api/units/${unitId}/apply`, { message: applyMessage.trim() });
									}}
								>
									{t('apply')}
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
