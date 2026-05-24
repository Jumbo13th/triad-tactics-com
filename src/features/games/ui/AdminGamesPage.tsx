'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import {
	parseAdminGameDraftMutationResponse,
	parseAdminGamesOverviewResponse,
	type AdminGameMissionOverview,
	type AdminGamesOverviewView
} from '@/features/games/domain/api';
import type { GameDraftCreateMode, GameMode } from '@/features/games/domain/types';
import type { AppLocale } from '@/i18n/locales';
import { formatLocalizedDateTime, type ViewerHourCycle } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function formatMissionStatus(mission: AdminGameMissionOverview, t: ReturnType<typeof useTranslations<'admin'>>): string {
	if (mission.status === 'draft') return t('gamesStatus.draft');
	if (mission.status === 'published') return t('gamesStatus.published');
	return t('gamesStatus.archived');
}

function formatPriorityState(mission: AdminGameMissionOverview, t: ReturnType<typeof useTranslations<'admin'>>): string {
	if (mission.priorityClaimManualState === 'open') return t('gamesPriorityState.open');
	if (mission.priorityClaimManualState === 'closed') return t('gamesPriorityState.closed');
	return t('gamesPriorityState.default');
}

function formatArchiveResult(mission: AdminGameMissionOverview, t: ReturnType<typeof useTranslations<'admin'>>): string | null {
	if (!mission.archiveResult) return null;
	if (mission.archiveResult.outcome === 'draw') return t('gamesArchiveResultDraw');
	if (!mission.archiveResult.winnerSideId) return null;
	const winner = mission.archiveResult.sideScores.find((s) => s.sideId === mission.archiveResult!.winnerSideId);
	return t('gamesArchiveResultWinner', { side: winner?.sideName ?? mission.archiveResult.winnerSideId });
}

function formatArchiveStatus(mission: AdminGameMissionOverview, t: ReturnType<typeof useTranslations<'admin'>>): string | null {
	if (mission.archiveStatus === 'completed') return t('gamesArchiveStatusValue.completed');
	if (mission.archiveStatus === 'canceled') return t('gamesArchiveStatusValue.canceled');
	return null;
}

function renderStateBadge(label: string, tone: 'accent' | 'neutral' | 'success' | 'danger') {
	const tones = {
		accent: 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]',
		neutral: 'border-neutral-800 bg-white/5 text-neutral-300',
		success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		danger: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	return (
		<span
			className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${tones[tone]}`}
		>
			{label}
		</span>
	);
}

async function fetchAdminStatus(): Promise<AdminStatus> {
	try {
		const res = await fetch('/api/admin/status', { cache: 'no-store' });
		const json: unknown = (await res.json()) as unknown;
		return parseAdminStatusResponse(json) ?? { connected: false, isAdmin: false };
	} catch {
		return { connected: false, isAdmin: false };
	}
}

async function fetchOverview(): Promise<AdminGamesOverviewView> {
	try {
		const res = await fetch('/api/admin/games', { cache: 'no-store' });
		const json: unknown = (await res.json()) as unknown;
		return parseAdminGamesOverviewResponse(json) ?? { error: 'server_error' };
	} catch {
		return { error: 'server_error' };
	}
}

export default function AdminGamesPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const localeParam = (params.locale as string) || 'en';
	const locale = useLocale();
	const redirectPath = buildLocalizedPath(localeParam, pathname);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [overview, setOverview] = useState<AdminGamesOverviewView | null>(null);
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const [creatingMode, setCreatingMode] = useState<GameDraftCreateMode | null>(null);
	const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('standard');
	const [deletingDraft, setDeletingDraft] = useState(false);
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const nextStatus = await fetchAdminStatus();
			if (!cancelled) setStatus(nextStatus);
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;

		let cancelled = false;
		(async () => {
			const nextOverview = await fetchOverview();
			if (!cancelled) setOverview(nextOverview);
		})();

		return () => {
			cancelled = true;
		};
	}, [status]);

	const reloadOverview = async () => {
		setOverview(await fetchOverview());
	};

	const handleCreateDraft = async (mode: GameDraftCreateMode) => {
		try {
			setFeedback(null);
			setCreatingMode(mode);
			const res = await fetch('/api/admin/games/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mode, gameMode: selectedGameMode })
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminGameDraftMutationResponse(json);

			if (!res.ok || !parsed || 'error' in parsed) {
				const errorKey = parsed && 'error' in parsed ? parsed.error : 'server_error';
				setFeedback({ tone: 'error', message: ta(`gamesError.${errorKey}`) });
				return;
			}

			setFeedback({
				tone: 'success',
				message: mode === 'blank' ? ta('gamesDraftCreatedBlank') : ta('gamesDraftCreatedDuplicate')
			});
			await reloadOverview();
		} catch {
			setFeedback({ tone: 'error', message: ta('gamesError.server_error') });
		} finally {
			setCreatingMode(null);
		}
	};

	const handleDeleteDraft = async () => {
		const confirmed = window.confirm(ta('gamesDeleteDraftConfirm'));
		if (!confirmed) return;

		try {
			setFeedback(null);
			setDeletingDraft(true);
			const res = await fetch('/api/admin/games/draft', {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminGamesOverviewResponse(json);

			if (!res.ok) {
				const errorKey = parsed && 'error' in parsed ? parsed.error : 'server_error';
				setFeedback({ tone: 'error', message: ta(`gamesError.${errorKey}`) });
				return;
			}

			setFeedback({ tone: 'success', message: ta('gamesDraftDeleted') });
			await reloadOverview();
		} catch {
			setFeedback({ tone: 'error', message: ta('gamesError.server_error') });
		} finally {
			setDeletingDraft(false);
		}
	};

	const overviewLoaded = overview && 'success' in overview && overview.success;
	const canDuplicate = !!overviewLoaded && (!!overview.published || overview.archivedMissions.length > 0) && !overview.draft;

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-5">
					<AdminToolbar
						title={ta('gamesTitle')}
						countText={overviewLoaded ? ta('gamesArchiveCount', { count: overview.archivedMissions.length }) : undefined}
						actions={
							overviewLoaded && !overview.draft ? (
								<div className="flex flex-wrap items-center gap-3">
									<div className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 p-0.5">
										<button
											type="button"
											onClick={() => setSelectedGameMode('standard')}
											className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
												selectedGameMode === 'standard'
													? 'bg-[color:var(--accent)] text-neutral-950'
													: 'text-neutral-400 hover:text-neutral-200'
											}`}
										>
											{ta('gamesGameModeStandard')}
										</button>
										<button
											type="button"
											onClick={() => setSelectedGameMode('simple')}
											className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
												selectedGameMode === 'simple'
													? 'bg-[color:var(--accent)] text-neutral-950'
													: 'text-neutral-400 hover:text-neutral-200'
											}`}
										>
											{ta('gamesGameModeSimple')}
										</button>
									</div>
									<AdminButton
										variant="secondary"
										onClick={() => void handleCreateDraft('duplicate_previous')}
										disabled={creatingMode !== null || !canDuplicate}
									>
										{creatingMode === 'duplicate_previous'
											? ta('gamesCreatingDuplicate')
											: ta('gamesCreateDuplicate')}
									</AdminButton>
									<AdminButton
										variant="primary"
										onClick={() => void handleCreateDraft('blank')}
										disabled={creatingMode !== null}
									>
										{creatingMode === 'blank' ? ta('gamesCreatingBlank') : ta('gamesCreateBlank')}
									</AdminButton>
								</div>
							) : null
						}
					/>
					<p className="text-sm text-neutral-400">{ta('gamesSubtitle')}</p>

					{feedback ? (
						<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>
							{feedback.message}
						</p>
					) : null}

					{overview === null ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : 'error' in overview ? (
						<p className="text-sm text-neutral-300">{ta('gamesLoadError')}</p>
					) : (
						<>
							<div className="grid gap-3 sm:grid-cols-3">
								<div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{ta('gamesStatDraft')}</p>
									<p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50">{overview.draft ? '1' : '0'}</p>
								</div>
								<div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{ta('gamesStatPublished')}</p>
									<p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50">{overview.published ? '1' : '0'}</p>
								</div>
								<div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{ta('gamesStatArchive')}</p>
									<p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50">{overview.archivedMissions.length}</p>
								</div>
							</div>

							<div className="grid gap-4">
								{overview.draft ? (
									<GameOverviewCard
										mission={overview.draft}
										label={ta('gamesDraftCardTitle')}
										emptyLabel={ta('gamesUntitledMission')}
										timeZone={timeZone}
										hourCycle={hourCycle}
										locale={locale}
										t={ta}
										actions={
											<div className="flex flex-wrap items-center gap-3">
												<Link
													href={`/admin/games/${overview.draft.id}`}
													className="inline-flex items-center rounded-xl bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm shadow-black/30 transition hover:opacity-95"
												>
													{ta('gamesOpenEditor')}
												</Link>
												<AdminButton variant="secondary" onClick={() => void handleDeleteDraft()} disabled={deletingDraft}>
													{deletingDraft ? ta('gamesDeletingDraft') : ta('gamesDeleteDraft')}
												</AdminButton>
											</div>
										}
									/>
								) : (
									<EmptyMissionState title={ta('gamesNoDraftTitle')} text={ta('gamesNoDraftText')} />
								)}

								{overview.published ? (
									<GameOverviewCard
										mission={overview.published}
										label={ta('gamesPublishedCardTitle')}
										emptyLabel={ta('gamesUntitledMission')}
										timeZone={timeZone}
										hourCycle={hourCycle}
										locale={locale}
										t={ta}
										actions={
											<div className="flex flex-wrap items-center gap-3">
												<Link
													href={`/admin/games/${overview.published.id}`}
													className="inline-flex items-center rounded-xl bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm shadow-black/30 transition hover:opacity-95"
												>
													{ta('gamesOpenEditor')}
												</Link>
												{overview.published.shortCode ? (
													<Link
														href={`/games/${overview.published.shortCode}`}
														className="inline-flex items-center rounded-xl border border-neutral-700 bg-white/5 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/20 transition hover:bg-white/10"
													>
														{ta('gamesOpenPublishedMission')}
													</Link>
												) : null}
											</div>
										}
									/>
								) : (
									<EmptyMissionState title={ta('gamesNoPublishedTitle')} text={ta('gamesNoPublishedText')} />
								)}
							</div>

							{overview.archivedMissions.length > 0 ? (
								<details className="group grid gap-4">
									<summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
										<div>
											<h3 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('gamesArchivePanelTitle')}</h3>
											<p className="mt-1 text-sm text-neutral-400">{ta('gamesArchivePanelText')}</p>
										</div>
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
									<div className="grid gap-4">
										{overview.archivedMissions.map((mission) => (
											<GameOverviewCard
												key={mission.id}
												mission={mission}
												label={ta('gamesArchivedCardTitle')}
												emptyLabel={ta('gamesUntitledMission')}
												timeZone={timeZone}
												hourCycle={hourCycle}
												locale={locale}
												t={ta}
												actions={
													<div className="flex flex-wrap items-center gap-3">
														<Link
															href={`/admin/games/${mission.id}`}
															className="inline-flex items-center rounded-xl bg-[color:var(--accent)] px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm shadow-black/30 transition hover:opacity-95"
														>
															{ta('gamesOpenEditor')}
														</Link>
														{mission.shortCode ? (
															<Link
																href={`/games/${mission.shortCode}`}
																className="inline-flex items-center rounded-xl border border-neutral-700 bg-white/5 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/20 transition hover:bg-white/10"
															>
																{ta('gamesOpenPublishedMission')}
															</Link>
														) : null}
													</div>
												}
											/>
										))}
									</div>
								</details>
							) : (
								<EmptyMissionState title={ta('gamesNoArchiveTitle')} text={ta('gamesNoArchiveText')} />
							)}
						</>
					)}
				</div>
			</AdminGate>
		</AdminSurface>
	);
}

function EmptyMissionState({ title, text }: { title: string; text: string }) {
	return (
		<div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/30 p-5">
			<h3 className="text-lg font-semibold tracking-tight text-neutral-50">{title}</h3>
			<p className="mt-2 text-sm text-neutral-400">{text}</p>
		</div>
	);
}

function GameOverviewCard({
	mission,
	label,
	emptyLabel,
	locale,
	timeZone,
	hourCycle,
	t,
	actions
}: {
	mission: AdminGameMissionOverview;
	label: string;
	emptyLabel: string;
	locale: string;
	timeZone: string | null;
	hourCycle: ViewerHourCycle | null;
	t: ReturnType<typeof useTranslations<'admin'>>;
	actions?: ReactNode;
}) {
	const formatDateTime = (value: string | null) =>
		formatLocalizedDateTime(value, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' });
	const startsAt = formatDateTime(mission.startsAt);
	const updatedAt = formatDateTime(mission.updatedAt);
	const publishedAt = formatDateTime(mission.publishedAt);
	const priorityOpensAt = formatDateTime(mission.priorityClaimOpensAt);
	const priorityReleasedAt = formatDateTime(mission.priorityGameplayReleasedAt);
	const regularReleasedAt = formatDateTime(mission.regularGameplayReleasedAt);
	const archiveResult = formatArchiveResult(mission, t);
	const archiveStatus = formatArchiveStatus(mission, t);

	return (
		<section className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5 shadow-sm shadow-black/20">
			<div className="flex flex-wrap items-center gap-2">
				{renderStateBadge(label, 'accent')}
				{renderStateBadge(
					formatMissionStatus(mission, t),
					mission.status === 'published' ? 'success' : mission.status === 'archived' ? 'danger' : 'neutral'
				)}
				{mission.gameMode === 'simple' ? renderStateBadge(t('gamesGameModeSimple'), 'neutral') : null}
			</div>

			<div>
				<h3 className="text-xl font-semibold tracking-tight text-neutral-50">
					{mission.title.trim() || emptyLabel}
				</h3>
				<p className="mt-2 whitespace-pre-line text-sm text-neutral-300">
					{(mission.description[locale as AppLocale] || mission.description.en).trim() || t('gamesNoDescription')}
				</p>
			</div>

			{actions}

			<div className="grid gap-3 sm:grid-cols-2">
				<InfoBlock label={t('gamesStartsAt')} value={startsAt ?? t('gamesNotScheduled')} />
				<InfoBlock label={t('gamesUpdatedAt')} value={updatedAt ?? t('gamesUnknownTime')} />
				<InfoBlock label={t('gamesServer')} value={mission.serverName.trim() || t('gamesServerUnset')} />
				<InfoBlock
					label={t('gamesConnection')}
					value={
						mission.serverHost.trim() && mission.serverPort
							? `${mission.serverHost}:${mission.serverPort}`
							: t('gamesConnectionUnset')
					}
				/>
				<InfoBlock label={t('gamesPriorityClaim')} value={formatPriorityState(mission, t)} />
				<InfoBlock label={t('gamesPriorityOpens')} value={priorityOpensAt ?? t('gamesNoSchedule')} />
				<InfoBlock label={t('gamesRegularJoin')} value={mission.regularJoinEnabled ? t('gamesEnabled') : t('gamesDisabled')} />
				<InfoBlock label={t('gamesBadgeCount')} value={String(mission.priorityBadgeTypeIds.length)} />
				<InfoBlock label={t('gamesSettingsRevision')} value={String(mission.settingsRevision)} />
				<InfoBlock label={t('gamesSlottingRevision')} value={String(mission.slottingRevision)} />
				<InfoBlock label={t('gamesEarlyPassword')} value={mission.earlyPassword || t('gamesMissing')} />
				<InfoBlock label={t('gamesFinalPassword')} value={mission.finalPassword || t('gamesMissing')} />
				{mission.status === 'published' ? (
					<InfoBlock label={t('gamesPublishedAt')} value={publishedAt ?? t('gamesUnknownTime')} />
				) : null}
				{mission.status === 'published' ? (
					<InfoBlock label={t('gamesPriorityReleasedAt')} value={priorityReleasedAt ?? t('gamesNotReleased')} />
				) : null}
				{mission.status === 'published' ? (
					<InfoBlock label={t('gamesRegularReleasedAt')} value={regularReleasedAt ?? t('gamesNotReleased')} />
				) : null}
				{mission.status === 'archived' && archiveStatus ? (
					<InfoBlock label={t('gamesArchiveStatus')} value={archiveStatus} />
				) : null}
				{mission.status === 'archived' && archiveResult ? (
					<InfoBlock label={t('gamesArchiveResult')} value={archiveResult} />
				) : null}
			</div>
		</section>
	);
}

function InfoBlock({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
			<p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{label}</p>
			<p className="mt-2 text-sm text-neutral-200">{value}</p>
		</div>
	);
}
