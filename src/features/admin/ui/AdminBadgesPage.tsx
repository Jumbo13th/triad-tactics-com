'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import {
	parseAdminBadgeMutationResponse,
	parseAdminBadgesResponse,
	parseAdminStatusResponse,
	type AdminStatus
} from '@/features/admin/domain/api';
import type { AdminBadgeType } from '@/features/admin/domain/types';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from './root';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function renderStateBadge(label: string, tone: 'success' | 'neutral' | 'danger') {
	const tones = {
		success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		neutral: 'border-neutral-800 bg-white/5 text-neutral-300',
		danger: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${tones[tone]}`}>
			{label}
		</span>
	);
}

export default function AdminBadgesPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [badgeCatalog, setBadgeCatalog] = useState<AdminBadgeType[]>([]);
	const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [labelInput, setLabelInput] = useState('');
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
	const [creating, setCreating] = useState(false);
	const [statusMutationId, setStatusMutationId] = useState<number | null>(null);
	const [discordRoleInputs, setDiscordRoleInputs] = useState<Record<number, string>>({});
	const [discordRoleSavingId, setDiscordRoleSavingId] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	const loadBadges = async () => {
		setCatalogState('loading');
		try {
			const res = await fetch('/api/admin/badges', { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminBadgesResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setCatalogState('error');
				return;
			}

			setBadgeCatalog(parsed.badges);
			setDiscordRoleInputs(Object.fromEntries(parsed.badges.map((b: AdminBadgeType) => [b.id, b.discord_role_id ?? ''])));
			setCatalogState('ready');
		} catch {
			setCatalogState('error');
		}
	};

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		void loadBadges();
	}, [status]);

	const handleCreateBadge = async () => {
		try {
			setFeedback(null);
			setCreating(true);
			const res = await fetch('/api/admin/badges', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ label: labelInput })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminBadgeMutationResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setFeedback({
					tone: 'error',
					message: ta('badgesCreateError')
				});
				return;
			}

			setLabelInput('');
			setFeedback({ tone: 'success', message: ta('badgesCreateSuccess') });
			await loadBadges();
		} catch {
			setFeedback({ tone: 'error', message: ta('badgesCreateError') });
		} finally {
			setCreating(false);
		}
	};

	const handleSetBadgeStatus = async (badgeTypeId: number, nextStatus: 'active' | 'retired') => {
		try {
			setFeedback(null);
			setStatusMutationId(badgeTypeId);
			const res = await fetch(`/api/admin/badges/${badgeTypeId}/status`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminBadgeMutationResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setFeedback({ tone: 'error', message: ta('badgesStatusUpdateError') });
				return;
			}

			setFeedback({ tone: 'success', message: ta('badgesStatusUpdateSuccess') });
			await loadBadges();
		} catch {
			setFeedback({ tone: 'error', message: ta('badgesStatusUpdateError') });
		} finally {
			setStatusMutationId(null);
		}
	};

	const handleSaveDiscordRole = async (badgeTypeId: number) => {
		try {
			setFeedback(null);
			setDiscordRoleSavingId(badgeTypeId);
			const value = discordRoleInputs[badgeTypeId]?.trim() || null;
			const res = await fetch(`/api/admin/badges/${badgeTypeId}/discord-role`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ discordRoleId: value })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminBadgeMutationResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setFeedback({ tone: 'error', message: ta('badgesDiscordRoleUpdateError') });
				return;
			}
			setFeedback({ tone: 'success', message: ta('badgesDiscordRoleUpdateSuccess') });
			await loadBadges();
		} catch {
			setFeedback({ tone: 'error', message: ta('badgesDiscordRoleUpdateError') });
		} finally {
			setDiscordRoleSavingId(null);
		}
	};

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					<AdminToolbar
						title={ta('badgesTitle')}
						countText={catalogState === 'ready' ? ta('badgesCount', { count: badgeCatalog.length }) : undefined}
					/>
					<p className="text-sm text-neutral-300">{ta('badgesSubtitle')}</p>

					{feedback ? (
						<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>
							{feedback.message}
						</p>
					) : null}

					<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
						<div>
							<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('badgesCreateTitle')}</h2>
							<p className="mt-1 text-sm text-neutral-400">{ta('badgesCreateText')}</p>
						</div>
						<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
							<label className="grid gap-2 text-sm text-neutral-200">
								<span>{ta('badgesFieldLabel')}</span>
								<input
									value={labelInput}
									onChange={(event) => setLabelInput(event.target.value)}
									placeholder={ta('badgesFieldLabelPlaceholder')}
									className="block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
								/>
							</label>
							<AdminButton variant="primary" onClick={() => void handleCreateBadge()} disabled={creating}>
								{creating ? ta('badgesCreating') : ta('badgesCreateAction')}
							</AdminButton>
						</div>
					</section>

					<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
						<div>
							<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('badgesCatalogTitle')}</h2>
							<p className="mt-1 text-sm text-neutral-400">{ta('badgesCatalogText')}</p>
						</div>

						{catalogState === 'loading' ? (
							<p className="text-sm text-neutral-300">{ta('loading')}</p>
						) : catalogState === 'error' ? (
							<p className="text-sm text-red-300">{ta('badgesLoadError')}</p>
						) : badgeCatalog.length === 0 ? (
							<p className="text-sm text-neutral-300">{ta('badgesEmpty')}</p>
						) : (
							<div className="grid gap-3">
								{badgeCatalog.map((badge) => {
									const isMutating = statusMutationId === badge.id;
									const isActive = badge.status === 'active';
									return (
										<div key={badge.id} className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<div className="grid gap-1">
													<div className="flex flex-wrap items-center gap-2">
														<p className="text-base font-semibold text-neutral-50">{badge.label}</p>
														{renderStateBadge(isActive ? ta('badgesStatusActive') : ta('badgesStatusRetired'), isActive ? 'success' : 'danger')}
													</div>
													<div className="flex flex-wrap gap-3 text-sm text-neutral-400">
														<span>{ta('badgesUserCount', { count: badge.user_count })}</span>
														<span>{ta('badgesMissionCount', { count: badge.mission_count })}</span>
													</div>
												</div>
												<AdminButton
													variant="secondary"
													onClick={() => void handleSetBadgeStatus(badge.id, isActive ? 'retired' : 'active')}
													disabled={isMutating}
												>
													{isMutating
														? isActive
															? ta('badgesRetiring')
															: ta('badgesActivating')
														: isActive
															? ta('badgesRetireAction')
															: ta('badgesActivateAction')}
												</AdminButton>
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<label className="text-xs text-neutral-500">{ta('badgesDiscordRoleId')}</label>
												<input
													value={discordRoleInputs[badge.id] ?? ''}
													onChange={(e) => setDiscordRoleInputs({ ...discordRoleInputs, [badge.id]: e.target.value })}
													placeholder={ta('badgesDiscordRoleIdPlaceholder')}
													className="w-48 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-50 placeholder-neutral-600 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
												/>
												<AdminButton
													variant="secondary"
													onClick={() => void handleSaveDiscordRole(badge.id)}
													disabled={discordRoleSavingId === badge.id || (discordRoleInputs[badge.id] ?? '') === (badge.discord_role_id ?? '')}
												>
													{discordRoleSavingId === badge.id ? ta('badgesDiscordRoleSaving') : ta('badgesDiscordRoleSave')}
												</AdminButton>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</section>
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
