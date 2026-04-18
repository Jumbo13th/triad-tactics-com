'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	AdminSurface,
	AdminToolbar,
	AdminSearchInput,
	AdminTabButton,
	AdminButton,
	AdminDisclosure,
	AdminField,
	AdminPagination
} from '@/features/admin/ui/root';
import AvatarUploadField from './AvatarUploadField';

type UnitSummary = {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	leaderCallsign: string | null;
	memberCount: number;
};

type Unit = {
	id: number;
	name: string;
	tag: string;
	description: string;
	status: string;
	avatarMime: string | null;
	updatedAt: string;
	leaderUserId: number | null;
	leaderCallsign: string | null;
	slotsAllocated: number;
	memberCount: number;
	applicantCount: number;
	memberNames: string;
	history: string;
	otherProjects: string;
	joinMessage: string;
};

type UnitMembership = {
	id: number;
	userId: number;
	callsign: string | null;
	role: string;
	message: string;
};

type StatusTab = 'unverified' | 'verified' | undefined;

export default function AdminUnitsPage() {
	const t = useTranslations('units');
	const [units, setUnits] = useState<UnitSummary[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [query, setQuery] = useState('');
	const [statusTab, setStatusTab] = useState<StatusTab>(undefined);
	const [hasSlotsOnly, setHasSlotsOnly] = useState(false);
	const [loading, setLoading] = useState(true);
	const searchRef = useRef<HTMLInputElement>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		const params = new URLSearchParams();
		params.set('page', String(page));
		if (query) params.set('q', query);
		if (statusTab) params.set('status', statusTab);
		if (hasSlotsOnly) params.set('hasSlots', 'true');

		let cancelled = false;
		fetch(`/api/admin/units?${params}`)
			.then(r => r.json())
			.then(data => {
				if (cancelled) return;
				setUnits(data.units ?? []);
				setTotal(data.total ?? 0);
				setLoading(false);
			})
			.catch(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [page, query, statusTab, hasSlotsOnly, refreshKey]);

	function reload() { setRefreshKey(k => k + 1); }

	return (
		<AdminSurface>
			<div className="grid gap-4 grid-cols-1">
			<AdminToolbar
				title={t('title')}
				countText={`${total} unit${total !== 1 ? 's' : ''}`}
				actions={
					<>
						<AdminTabButton active={!statusTab} onClick={() => { setStatusTab(undefined); setPage(1); }}>
							All
						</AdminTabButton>
						<AdminTabButton active={statusTab === 'unverified'} onClick={() => { setStatusTab('unverified'); setPage(1); }}>
							{t('status.unverified')}
						</AdminTabButton>
						<AdminTabButton active={statusTab === 'verified'} onClick={() => { setStatusTab('verified'); setPage(1); }}>
							{t('status.verified')}
						</AdminTabButton>
						<AdminTabButton active={hasSlotsOnly} onClick={() => { setHasSlotsOnly(v => !v); setPage(1); }}>
							{t('filter.slots.with')}
						</AdminTabButton>
						<AdminSearchInput
							inputRef={searchRef}
							value={query}
							onChange={e => { setQuery(e.target.value); setPage(1); }}
							onClear={() => { setQuery(''); setPage(1); }}
							placeholder="Search by name, tag, or commander…"
						/>
					</>
				}
			/>

			<div className="space-y-3">
				{loading && <p className="py-4 text-center text-sm text-neutral-500">Loading…</p>}
				{!loading && units.length === 0 && (
					<p className="py-4 text-center text-sm text-neutral-500">{t('noUnits')}</p>
				)}
				{units.map(unit => (
					<AdminUnitRow key={unit.id} unit={unit} onAction={reload} />
				))}
			</div>

			{total > 50 && (
					<AdminPagination
						page={page}
						totalPages={Math.ceil(total / 50)}
						summary={`${total} units`}
						previousLabel="Previous"
						nextLabel="Next"
						onPageChange={setPage}
					/>
			)}
			</div>
		</AdminSurface>
	);
}

function AdminUnitRow({ unit, onAction }: { unit: UnitSummary; onAction: () => void }) {
	const t = useTranslations('units');
	const [detail, setDetail] = useState<Unit | null>(null);
	const [members, setMembers] = useState<UnitMembership[]>([]);
	const [slotsInput, setSlotsInput] = useState('');
	const [nameInput, setNameInput] = useState('');
	const [tagInput, setTagInput] = useState('');
	const [descInput, setDescInput] = useState('');
	const [joinMsgInput, setJoinMsgInput] = useState('');
	const [actionError, setActionError] = useState<string | null>(null);
	const [editSaved, setEditSaved] = useState(false);
	const unitId = unit.id;

	function applyDetail(data: { unit?: Unit; members?: UnitMembership[] }) {
		if (data.unit) {
			setDetail(data.unit);
			setSlotsInput(String(data.unit.slotsAllocated ?? 0));
			setNameInput(data.unit.name);
			setTagInput(data.unit.tag);
			setDescInput(data.unit.description);
			setJoinMsgInput(data.unit.joinMessage ?? '');
		}
		setMembers(data.members ?? []);
	}

	useEffect(() => {
		fetch(`/api/admin/units/${unitId}`)
			.then(r => r.json())
			.then(applyDetail);
	}, [unitId]);

	function loadDetail() {
		fetch(`/api/admin/units/${unitId}`)
			.then(r => r.json())
			.then(applyDetail);
	}

	async function adminAction(url: string, body: object) {
		setActionError(null);
		setEditSaved(false);
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const data = await res.json();
			setActionError(data.error ?? 'Error');
			return;
		}
		onAction();
		loadDetail();
	}

	async function saveUnitInfo() {
		setActionError(null);
		setEditSaved(false);
		const res = await fetch(`/api/admin/units/${unitId}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: nameInput.trim(), tag: tagInput.trim(), description: descInput.trim(), joinMessage: joinMsgInput.trim() })
		});
		if (!res.ok) {
			const data = await res.json();
			setActionError(data.error ?? 'Error');
			return;
		}
		setEditSaved(true);
		onAction();
		loadDetail();
	}

	const statusBadgeClass =
		unit.status === 'verified' ? 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]' :
		'bg-neutral-800 text-neutral-400';

	return (
		<AdminDisclosure
			summaryLeft={
				<div className="flex items-center gap-2">
					<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass}`}>
						{t(`status.${unit.status}` as Parameters<typeof t>[0])}
					</span>
					<span className="rounded-lg border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2 py-0.5 text-xs font-bold tracking-widest text-[color:var(--accent)]">{unit.tag}</span>
					<span className="font-semibold text-neutral-50">{unit.name}</span>
				</div>
			}
			summaryRight={
				<span className="text-xs text-neutral-500">
					{t('members')}: {unit.memberCount}
					{unit.leaderCallsign && ` · ${t('commander')}: ${unit.leaderCallsign}`}
				</span>
			}
		>
			{detail && (
				<div className="space-y-4">
					{actionError && <p className="text-sm text-red-400">{actionError}</p>}
					{editSaved && <p className="text-sm text-green-400">{t('editSaved')}</p>}

					<AdminField label={t('avatar')}>
						<AvatarUploadField
							alt={unit.name}
							imageUrl={detail.avatarMime ? `/api/units/${unit.id}/avatar?v=${encodeURIComponent(detail.updatedAt)}` : null}
							uploadUrl={`/api/admin/units/${unitId}/avatar`}
							deleteUrl={`/api/admin/units/${unitId}/avatar`}
							onUploaded={() => { loadDetail(); onAction(); }}
							onDeleted={() => { loadDetail(); onAction(); }}
						/>
					</AdminField>

					{(detail.memberNames || detail.history || detail.otherProjects) && (
						<div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">{t('section.questionnaire')}</p>
							{detail.memberNames && (
								<AdminField label={t('memberNamesLabel')}>
									<p className="whitespace-pre-wrap text-sm">{detail.memberNames}</p>
								</AdminField>
							)}
							{detail.history && (
								<AdminField label={t('historyLabel')}>
									<p className="whitespace-pre-wrap text-sm">{detail.history}</p>
								</AdminField>
							)}
							{detail.otherProjects && (
								<AdminField label={t('otherProjectsLabel')}>
									<p className="whitespace-pre-wrap text-sm">{detail.otherProjects}</p>
								</AdminField>
							)}
						</div>
					)}

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<AdminField label={t('nameLabel')}>
							<input
								type="text"
								value={nameInput}
								onChange={e => setNameInput(e.target.value)}
								className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
							/>
						</AdminField>
						<AdminField label={t('tagLabel')}>
							<input
								type="text"
								value={tagInput}
								onChange={e => setTagInput(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
								className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
							/>
						</AdminField>
					</div>
					<AdminField label={t('descriptionLabel')}>
						<textarea
							value={descInput}
							onChange={e => setDescInput(e.target.value)}
							rows={3}
							className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
						/>
					</AdminField>
					<AdminField label={t('joinMessageLabel')}>
						<textarea
							value={joinMsgInput}
							onChange={e => setJoinMsgInput(e.target.value)}
							rows={2}
							className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
						/>
					</AdminField>
					<AdminButton variant="primary" onClick={saveUnitInfo}>
						{t('save')}
					</AdminButton>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<AdminField label={t('commander')}>
							{detail.leaderCallsign ?? '—'}
						</AdminField>
						<AdminField label={t('slotsAllocated')}>
							<div className="flex items-center gap-2">
								<input
									type="number"
									min={0}
									max={100}
									value={slotsInput}
									onChange={e => setSlotsInput(e.target.value)}
									className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-50"
								/>
								<AdminButton
									variant="secondary"
									onClick={() => adminAction(`/api/admin/units/${unit.id}/slots`, { slotsAllocated: Number(slotsInput) })}
								>
									{t('actions.setSlots')}
								</AdminButton>
							</div>
						</AdminField>
					</div>

					<div className="flex flex-wrap gap-2">
						{detail.status === 'unverified' && (
							<AdminButton variant="primary" onClick={() => adminAction(`/api/admin/units/${unit.id}/verify`, { action: 'verify' })}>
								{t('actions.verify')}
							</AdminButton>
						)}
						{detail.status === 'verified' && (
							<AdminButton variant="secondary" onClick={() => adminAction(`/api/admin/units/${unit.id}/verify`, { action: 'unverify' })}>
								{t('actions.unverify')}
							</AdminButton>
						)}
						<AdminButton variant="secondary" onClick={() => adminAction(`/api/admin/units/${unit.id}/verify`, { action: 'delete' })}>
							{t('actions.delete')}
						</AdminButton>
					</div>

					{members.length > 0 && (
						<div>
							<h4 className="text-sm font-semibold text-neutral-300">{t('members')} & {t('applicants')}</h4>
							<div className="mt-2 space-y-1">
								{[...members].sort((a, b) => {
								const aScore = detail.leaderUserId === a.userId ? 0 : a.role === 'member' ? 1 : 2;
								const bScore = detail.leaderUserId === b.userId ? 0 : b.role === 'member' ? 1 : 2;
								return aScore - bScore;
							}).map(m => (
									<div key={m.id} className="rounded-lg border border-neutral-800 px-3 py-2 text-sm">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span className="text-neutral-200">{m.callsign ?? `User #${m.userId}`}</span>
											{detail.leaderUserId === m.userId ? (
												<span className="rounded px-1.5 py-0.5 text-xs bg-[color:var(--accent)]/10 text-[color:var(--accent)]">
													{t('commander')}
												</span>
											) : (
												<span className={
													'rounded px-1.5 py-0.5 text-xs ' +
													(m.role === 'member' ? 'bg-white/10 text-neutral-400' : 'bg-yellow-900/40 text-yellow-400')
												}>
													{t(`role.${m.role}` as Parameters<typeof t>[0])}
												</span>
											)}
										</div>
										<div className="flex gap-1">
											{m.role === 'applicant' && (
												<>
													<button
														type="button"
														onClick={() => adminAction(`/api/admin/units/${unit.id}/members`, { userId: m.userId, action: 'approve' })}
														className="rounded bg-[color:var(--accent)]/10 px-1.5 py-0.5 text-xs text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20"
													>
														{t('actions.approve')}
													</button>
													<button
														type="button"
														onClick={() => adminAction(`/api/admin/units/${unit.id}/members`, { userId: m.userId, action: 'reject' })}
														className="rounded bg-red-900/40 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/60"
													>
														{t('actions.reject')}
													</button>
												</>
											)}
											{m.role === 'member' && detail.leaderUserId !== m.userId && (
												<>
													<button
														type="button"
														onClick={() => adminAction(`/api/admin/units/${unit.id}/leader`, { userId: m.userId })}
														className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-white/15"
													>
														{t('actions.setLeader')}
													</button>
													<button
														type="button"
														onClick={() => adminAction(`/api/admin/units/${unit.id}/members`, { userId: m.userId, action: 'remove' })}
														className="rounded bg-red-900/40 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/60"
													>
														{t('actions.remove')}
													</button>
												</>
											)}
										</div>
									</div>
									{m.message && (
										<p className="mt-1 whitespace-pre-line text-xs text-neutral-400">{m.message}</p>
									)}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
			)}
		</AdminDisclosure>
	);
}
