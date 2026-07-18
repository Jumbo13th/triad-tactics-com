'use client';

import { Fragment, useEffect, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import type { GameArchiveResult, GameArchiveStatus, GameMissionDetail } from '@/features/games/domain/types';
import type { AppLocale } from '@/i18n/locales';
import { sideDisplayName } from '@/features/games/domain/slotting';
import { useRouter } from '@/i18n/routing';
import { formatLocalizedDateTime, formatTimeZoneDisplay, parseDateTimeValue } from '@/platform/dateTime';
import { useCurrentTime } from '@/platform/useCurrentTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import {
	SLOTTING_INDEX_COLUMN_REM,
	SLOTTING_SQUAD_COLUMN_REM,
	buildSideRows,
	formatMissionUpdateMessage,
	formatCountdownValue,
	formatViewerDate,
	getCountdownParts,
	missionStatusLabel,
	slotAccessLabel,
	slottingTableWidthRem
} from './missionPageUtils';
import { useMissionActions } from './useMissionActions';
import {
	ConnectionSegment,
	CountdownSegment,
	SlotCell,
	SquadAssetsBadge,
	SyncedHorizontalScroll
} from './missionPageComponents';
import { useMissionGuide, MissionGuideModal } from './MissionGuideModal';
import { useSlottingSSE } from './useSlottingSSE';
import { useEpisodeSlotting, countPriorityAvailable, collectAllEpisodeSides, findUserHeldSlotId, findSlotAccess } from './useEpisodeSlotting';

export default function GameMissionPage({ mission, statsSlot = null }: { mission: GameMissionDetail; statsSlot?: ReactNode }) {
	const t = useTranslations('games');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const now = useCurrentTime();
	const { actionError, clearActionError, pendingActionId, busy, runAction } = useMissionActions(t);
	const [pendingConfirm, setPendingConfirm] = useState<{ kind: 'switch' | 'leave-slot' | 'leave-regular'; action: () => void } | null>(null);
	const guide = useMissionGuide();
	useSlottingSSE(mission.shortCode, mission.slottingRevision);

	const startDate = mission.startsAt ? parseDateTimeValue(mission.startsAt) : null;
	const startValid = startDate !== null && !Number.isNaN(startDate.getTime());
	const startTimestamp = startValid ? startDate.getTime() : null;
	const countdown = now !== null && startTimestamp !== null && startTimestamp > now ? getCountdownParts(startTimestamp, now) : null;
	const isMissionLive = mission.status === 'published' && startTimestamp !== null && now !== null ? startTimestamp <= now : false;
	const startsAt = formatViewerDate(mission.startsAt, locale, timeZone, hourCycle);
	const archivedAt = formatViewerDate(mission.archivedAt, locale, timeZone, hourCycle);

	const confirmTitle =
		pendingConfirm?.kind === 'switch'
			? t('confirmSwitchTitle')
			: pendingConfirm?.kind === 'leave-regular'
				? t('confirmLeaveRegularTitle')
				: t('confirmLeaveTitle');

	const confirmText =
		pendingConfirm?.kind === 'switch'
			? t('confirmSwitchText')
			: pendingConfirm?.kind === 'leave-regular'
				? t('confirmLeaveRegularText')
				: t('confirmLeaveText');

	const confirmAcceptLabel =
		pendingConfirm?.kind === 'switch'
			? t('confirmSwitchAccept')
			: pendingConfirm?.kind === 'leave-regular'
				? t('confirmLeaveRegularAccept')
				: t('confirmLeaveAccept');

	return (
		<section className="grid gap-6">
			<MissionGuideModal open={guide.open} onClose={guide.close} onDismiss={guide.dismiss} showDismiss={guide.autoOpened} t={t} />

			<HeroSection
				mission={mission}
				countdown={countdown}
				isMissionLive={isMissionLive}
				startsAt={startsAt}
				archivedAt={archivedAt}
				timeZone={timeZone}
				t={t}
			/>

			{/* For an archived mission the outcome IS the page: final score and
			    published statistics go first, right under the header. */}
			{mission.status === 'archived' && mission.archiveResult ? (
				<ResultsSection
					archiveResult={mission.archiveResult}
					archiveStatus={mission.archiveStatus}
					archiveReason={mission.archiveReason}
					sides={collectAllEpisodeSides(mission)}
					t={t}
				/>
			) : null}

			{statsSlot}

			{mission.status === 'published' && mission.gameMode !== 'simple' ? <MissionAccessNoticeSection t={t} /> : null}

			<MissionUpdatesSection mission={mission} t={t} />

			{actionError && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => { if (e.target === e.currentTarget) clearActionError(); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-red-500/30 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm text-red-200">{actionError}</p>
							<div className="mt-4 flex justify-end">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={clearActionError}
								>
									{t('actionErrorDismiss')}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}

			{pendingConfirm && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingConfirm(null); }}
					>
						<div role="alertdialog" aria-modal="true" className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950/95 p-6 shadow-xl">
							<p className="text-sm font-semibold text-neutral-100">
								{confirmTitle}
							</p>
							<p className="mt-2 text-sm text-neutral-400">
								{confirmText}
							</p>
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
									onClick={() => setPendingConfirm(null)}
								>
									{t('confirmSlotCancel')}
								</button>
								<button
									type="button"
									className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/25"
									onClick={() => {
										pendingConfirm.action();
										setPendingConfirm(null);
									}}
								>
									{confirmAcceptLabel}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}

			<ServerSection mission={mission} t={t} guideShow={guide.show} />

			<RegularJoinSection
				mission={mission}
				busy={busy}
				pendingActionId={pendingActionId}
				runAction={runAction}
				confirmAction={setPendingConfirm}
				guideShow={guide.show}
				t={t}
			/>

			{mission.gameMode !== 'simple' && <SlottingSection
				mission={mission}
				busy={busy}
				pendingActionId={pendingActionId}
				runAction={runAction}
				confirmAction={setPendingConfirm}
				guideShow={guide.show}
				t={t}
			/>}
		</section>
	);
}

function MissionAccessNoticeSection({
	t
}: {
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	return (
		<section className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/12 via-amber-500/8 to-red-500/8 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">{t('missionAccessNoticeTitle')}</p>
				<p className="max-w-5xl text-base font-semibold leading-8 text-neutral-50">{t('missionAccessNoticeBody')}</p>
				<ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-amber-50/95">
					<li>{t('missionAccessNoticeUnit')}</li>
					<li>{t('missionAccessNoticePriority')}</li>
					<li>{t('missionAccessNoticeRegular')}</li>
				</ul>
			</div>
		</section>
	);
}

function MissionUpdatesSection({
	mission,
	t
}: {
	mission: GameMissionDetail;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const latestUpdate = mission.updates[0] ?? null;
	const previousUpdates = mission.updates.slice(1);

	if (!latestUpdate) {
		return null;
	}

	return (
		<section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('missionUpdatesTitle')}</p>
					<p className="mt-2 max-w-4xl text-sm text-neutral-300">{t('missionUpdatesSubtitle')}</p>
				</div>

				<div className="rounded-2xl border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-4 py-4">
					<div className="flex flex-wrap items-center gap-3">
						<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
							{t('missionUpdatesLatestBadge')}
						</span>
						<span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
							{formatLocalizedDateTime(latestUpdate.createdAt, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? latestUpdate.createdAt}
						</span>
					</div>
					<p className="mt-3 text-base font-semibold text-neutral-50">{formatMissionUpdateMessage(latestUpdate, t)}</p>
				</div>

				{previousUpdates.length > 0 ? (
					<div className="rounded-2xl border border-neutral-800 bg-neutral-950/70">
						<div className="border-b border-neutral-800 px-4 py-3">
							<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{t('missionUpdatesHistoryTitle')}</p>
						</div>
						<div className="max-h-72 overflow-y-auto px-4 py-3">
							<div className="grid gap-3">
								{previousUpdates.map((update) => (
									<div key={update.id} className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-3">
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
											{formatLocalizedDateTime(update.createdAt, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? update.createdAt}
										</p>
										<p className="mt-2 text-sm leading-7 text-neutral-200">{formatMissionUpdateMessage(update, t)}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
}

function HeroSection({
	mission,
	countdown,
	isMissionLive,
	startsAt,
	archivedAt,
	timeZone,
	t
}: {
	mission: GameMissionDetail;
	countdown: ReturnType<typeof getCountdownParts> | null;
	isMissionLive: boolean;
	startsAt: string | null;
	archivedAt: string | null;
	timeZone: string | null;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const locale = useLocale();
	const heroEyebrow =
		mission.status === 'archived'
			? missionStatusLabel(mission, t)
			: isMissionLive
				? t('currentBadge')
				: t('upcomingBadge');

	const timerLabel =
		mission.status === 'archived'
			? t('countdownArchived')
			: isMissionLive
				? t('countdownLiveNow')
				: t('countdownTitle');

	const heroDateText =
		mission.status === 'archived'
			? archivedAt
				? `${t('archivedAtLabel')}: ${archivedAt}`
				: null
			: startsAt
				? `${t('startsAtLabel')}: ${startsAt}`
				: null;

	const timeZoneDisplay = formatTimeZoneDisplay(timeZone);
	const missionBriefing = (mission.description[locale as AppLocale] || mission.description.en) || t('missionDescriptionFallback');

	return (
		<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-4">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{heroEyebrow}</p>
						<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
							{mission.gameMode === 'simple' ? t('gameModeSimple') : t('gameModeStandard')}
						</span>
					</div>
					<h2 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">{mission.title}</h2>
				</div>

				<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{timerLabel}</p>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{countdown ? (
						<>
							<CountdownSegment value={formatCountdownValue(countdown.days)} label={t('countdownDays')} />
							<CountdownSegment value={formatCountdownValue(countdown.hours)} label={t('countdownHours')} />
							<CountdownSegment value={formatCountdownValue(countdown.minutes)} label={t('countdownMinutes')} />
							<CountdownSegment value={formatCountdownValue(countdown.seconds)} label={t('countdownSeconds')} />
						</>
					) : (
						<div className="col-span-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-300">
							{mission.status === 'archived'
								? archivedAt ?? t('countdownArchived')
								: isMissionLive
									? t('countdownLiveNow')
									: startsAt ?? missionStatusLabel(mission, t)}
						</div>
					)}
				</div>

				{heroDateText ? (
					<div className="inline-flex w-fit items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs font-semibold text-neutral-300">
						{heroDateText}
					</div>
				) : null}

				{mission.status !== 'archived' && isMissionLive ? (
					<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]">
						<span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--accent)] shadow-[0_0_12px_rgba(210,184,83,0.9)]" />
						{t('countdownLiveNow')}
					</div>
				) : null}

				{timeZoneDisplay ? (
					<div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
						<span className="inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]/70" />
						<span>{t('localTimeHint', { timezone: timeZoneDisplay })}</span>
					</div>
				) : null}

				<div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

				<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
					<p className="max-w-4xl whitespace-pre-line text-sm text-neutral-200">{missionBriefing}</p>
				</div>
			</div>
		</div>
	);
}

function ServerSection({
	mission,
	t,
	guideShow
}: {
	mission: GameMissionDetail;
	t: ReturnType<typeof useTranslations<'games'>>;
	guideShow: () => void;
}) {
	const serverNameDisplay = mission.serverName || t('serverPortUnknown');
	const serverHostDisplay = mission.serverHost || t('serverPortUnknown');
	const serverPortDisplay = mission.serverPort !== null ? String(mission.serverPort) : t('serverPortUnknown');
	const passwordStageLabel = mission.password.stage === 'final' ? t('passwordFinalLabel') : t('passwordEarlyLabel');
	const copyLabel = t('copyValueAction');
	const copiedLabel = t('copiedValueAction');
	const viewerAccessLevel = slotAccessLabel(mission.viewer.heldSlotAccess ?? 'regular', t);

	return (
		<section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-4">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('serverTitle')}</p>
					<HelpButton onClick={guideShow} label={t('guideOpenButton')} />
				</div>

				{mission.serverDetailsHidden ? (
					<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{t('serverPreparingTitle')}</p>
						<p className="mt-2 text-sm leading-7 text-amber-100">{t('serverPreparingBody')}</p>
					</div>
				) : (
					<>
						<div className="space-y-3">
							<p className="max-w-4xl text-sm text-neutral-300">{t('serverSubtitle')}</p>
							<div className="grid gap-3">
								<ConnectionSegment label={t('serverNameLabel')} value={serverNameDisplay} />
							</div>
						</div>

						<div className="space-y-3">
							<p className="max-w-4xl text-sm text-neutral-300">{t('directConnectSubtitle')}</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<ConnectionSegment label={t('serverAddressLabel')} value={serverHostDisplay} copyValue={mission.serverHost || null} copyLabel={copyLabel} copiedLabel={copiedLabel} />
								<ConnectionSegment label={t('serverPortLabel')} value={serverPortDisplay} mono copyValue={mission.serverPort !== null ? String(mission.serverPort) : null} copyLabel={copyLabel} copiedLabel={copiedLabel} />
							</div>
						</div>

						<div className="grid gap-3">
							<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{t('passwordTitle')}</p>
							{mission.password.value ? (
								<ConnectionSegment label={passwordStageLabel} value={mission.password.value} accent mono copyValue={mission.password.value} copyLabel={copyLabel} copiedLabel={copiedLabel} />
							) : (
								<div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
									<p className="text-sm leading-7 text-neutral-300">
										{mission.status === 'archived'
											? t('passwordArchivedHidden')
											: mission.password.missedJoinWindow
												? t('passwordMissedMissionStart')
												: mission.password.waitingForViewerAccess
													? t('passwordWaitingForAccessLevel', { accessLevel: viewerAccessLevel })
													: t('passwordRestrictedHidden')}
									</p>
								</div>
							)}
						</div>

						<div className="grid gap-3">
							<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
								<p className="text-sm leading-7 text-neutral-200">{t('passwordSubtitle')}</p>
								<p className="mt-3 text-sm leading-7 text-neutral-200">{t('passwordUnitNotice')}</p>
							</div>
							<div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3">
								<p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">{t('passwordSecurityTitle')}</p>
								<p className="mt-2 text-sm leading-7 text-red-100">{t('passwordSecurityNotice')}</p>
							</div>
						</div>
					</>
				)}
			</div>
		</section>
	);
}

type RunAction = (input: { id: string; path: string; body?: Record<string, unknown> }) => Promise<boolean>;

function RegularJoinSection({
	mission,
	busy,
	pendingActionId,
	runAction,
	confirmAction,
	guideShow,
	t
}: {
	mission: GameMissionDetail;
	busy: boolean;
	pendingActionId: string | null;
	runAction: RunAction;
	confirmAction: (pending: { kind: 'switch' | 'leave-slot' | 'leave-regular'; action: () => void }) => void;
	guideShow: () => void;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [confirmedNoSquad, setConfirmedNoSquad] = useState(false);
	const [confirmedPriorityOverride, setConfirmedPriorityOverride] = useState(false);

	const needsPriorityConfirmation = mission.viewer.hasPriorityBadge;
	const canConfirm = confirmedNoSquad && (!needsPriorityConfirmation || confirmedPriorityOverride);
	const priorityBadgeLabelList = mission.viewer.priorityBadgeLabels.join(', ');
	const regularJoinWhyBody = mission.viewer.canJoinRegular ? t('regularJoinWhyBody') : t('regularJoinWhyBodyHidden');

	const regularJoinUnavailableReason = (() => {
		if (mission.viewer.serverBanned) return t('serverBannedNotice');
		if (mission.status === 'archived') return t('regularJoinUnavailableArchived');
		if (mission.password.missedJoinWindow) return t('regularJoinUnavailableMissedWindow');
		if (mission.viewer.heldSlotId) return t('regularJoinUnavailableHeldSlot');
		if (mission.viewer.joinedRegular) return t('regularJoinUnavailableAlreadyJoined');
		if (!mission.regularJoinOpen) return t('regularJoinUnavailableClosed');
		return t('regularJoinUnavailableGeneric');
	})();

	const openModal = () => {
		setConfirmedNoSquad(false);
		setConfirmedPriorityOverride(false);
		setIsModalOpen(true);
	};

	const confirmJoin = async () => {
		if (!canConfirm || busy) return;
		const joined = await runAction({
			id: 'join-regular',
			path: `/api/games/${mission.shortCode}/join`
		});
		if (joined) setIsModalOpen(false);
	};

	return (
		<section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl" aria-hidden="true" />
			<div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-5">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">{t('regularJoinTitle')}</p>
					<HelpButton onClick={guideShow} label={t('guideOpenButton')} />
				</div>
				<div className="max-w-3xl">
					<p className="text-sm leading-7 text-neutral-300">{t('regularJoinSubtitle')}</p>
				</div>

				<div className="grid gap-3">
					<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{t('regularJoinWhoTitle')}</p>
						<p className="mt-2 text-sm leading-7 text-neutral-200">{t('regularJoinWhoBody')}</p>
					</div>
					<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{t('regularJoinWhyTitle')}</p>
						<p className="mt-2 text-sm leading-7 text-neutral-200">{regularJoinWhyBody}</p>
					</div>
				</div>

				<div className="grid gap-4">
					<div className="flex flex-wrap gap-2">
						{mission.viewer.canJoinRegular ? (
							<button
								type="button"
								disabled={busy}
								onClick={openModal}
								className="inline-flex min-h-12 items-center rounded-xl bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{busy && pendingActionId === 'join-regular' ? t('actionWorking') : t('joinMission')}
							</button>
						) : null}

						{mission.viewer.canLeaveRegular ? (
							<button
								type="button"
								disabled={busy}
								onClick={() => {
									confirmAction({
										kind: 'leave-regular',
										action: () => void runAction({
											id: 'leave-regular',
											path: `/api/games/${mission.shortCode}/leave`
										})
									});
								}}
								className="inline-flex min-h-12 items-center rounded-xl border border-neutral-700 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{pendingActionId === 'leave-regular' ? t('actionWorking') : t('leaveMission')}
							</button>
						) : null}
					</div>

					{!mission.viewer.canJoinRegular ? (
						<div className="rounded-xl border border-amber-400/35 bg-amber-300/10 px-4 py-3">
							<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">{t('regularJoinUnavailableTitle')}</p>
							<p className="mt-2 text-sm leading-7 text-amber-100">{regularJoinUnavailableReason}</p>
						</div>
					) : null}

					<div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70">
						<details className="group">
							<summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-neutral-200 transition hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
								<span className="grid gap-1">
									<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{t('regularJoinRosterTitle')}</span>
									<span className="text-xs text-neutral-500">{t('regularJoinRosterHint')}</span>
								</span>
								<span className="inline-flex items-center gap-2">
									<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-300">
										{t('regularJoinCount', { count: mission.regularJoiners.length })}
									</span>
									<svg
										className="h-5 w-5 shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										aria-hidden="true"
									>
										<path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
									</svg>
								</span>
							</summary>
							<div className="border-t border-neutral-800 px-4 py-3">
								{mission.regularJoiners.length > 0 ? (
									<ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-200">
										{mission.regularJoiners.map((joiner) => (
											<li key={joiner.userId}>{joiner.callsign}</li>
										))}
									</ol>
								) : (
									<p className="text-sm leading-7 text-neutral-400">{t('regularJoinNone')}</p>
								)}
							</div>
						</details>
					</div>
				</div>
			</div>

			{isModalOpen ? (
				<RegularJoinModal
					busy={busy}
					pendingActionId={pendingActionId}
					confirmedNoSquad={confirmedNoSquad}
					setConfirmedNoSquad={setConfirmedNoSquad}
					needsPriorityConfirmation={needsPriorityConfirmation}
					confirmedPriorityOverride={confirmedPriorityOverride}
					setConfirmedPriorityOverride={setConfirmedPriorityOverride}
					priorityBadgeLabelList={priorityBadgeLabelList}
					canConfirm={canConfirm}
					onClose={() => setIsModalOpen(false)}
					onConfirm={() => { void confirmJoin(); }}
					t={t}
				/>
			) : null}
		</section>
	);
}

function RegularJoinModal({
	busy,
	pendingActionId,
	confirmedNoSquad,
	setConfirmedNoSquad,
	needsPriorityConfirmation,
	confirmedPriorityOverride,
	setConfirmedPriorityOverride,
	priorityBadgeLabelList,
	canConfirm,
	onClose,
	onConfirm,
	t
}: {
	busy: boolean;
	pendingActionId: string | null;
	confirmedNoSquad: boolean;
	setConfirmedNoSquad: (v: boolean) => void;
	needsPriorityConfirmation: boolean;
	confirmedPriorityOverride: boolean;
	setConfirmedPriorityOverride: (v: boolean) => void;
	priorityBadgeLabelList: string;
	canConfirm: boolean;
	onClose: () => void;
	onConfirm: () => void;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	return (
		<div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
			<button
				type="button"
				aria-label={t('regularJoinModalClose')}
				onClick={onClose}
				className="absolute inset-0 bg-black/70 backdrop-blur-sm"
			/>
			<div className="relative z-10 flex min-h-full items-start justify-center sm:items-center">
				<div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-lg shadow-black/40 sm:max-h-[calc(100dvh-3rem)] sm:p-6">
					<div className="space-y-3">
						<h4 className="text-xl font-semibold tracking-tight text-neutral-50">{t('regularJoinModalTitle')}</h4>
						<p className="text-sm leading-7 text-neutral-300">{t('regularJoinModalIntro')}</p>
						<div className="rounded-xl border border-amber-400/45 bg-amber-300/10 px-3 py-3">
							<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">{t('regularJoinModalWarningTitle')}</p>
							<p className="mt-2 text-sm font-semibold leading-7 text-amber-50">{t('regularJoinModalWarningBody')}</p>
							<p className="mt-2 text-sm leading-7 text-amber-100/95">{t('regularJoinModalGuaranteeBody')}</p>
						</div>
					</div>

					<div className="mt-5 grid gap-3">
						<label className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-black/20 px-3 py-3 text-sm text-neutral-200">
							<input
								type="checkbox"
								checked={confirmedNoSquad}
								onChange={(event) => setConfirmedNoSquad(event.target.checked)}
								className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)]"
							/>
							<span>{t('regularJoinModalNoUnitCheckbox')}</span>
						</label>

						{needsPriorityConfirmation ? (
							<div className="overflow-hidden rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10">
								<div className="px-3 py-3">
									<p className="text-sm leading-7 text-neutral-100">{t('regularJoinModalPriorityInfo')}</p>
									{priorityBadgeLabelList ? (
										<p className="mt-2 text-sm leading-6 text-neutral-100/90">
											<span className="font-semibold text-[color:var(--accent)]">{t('regularJoinModalPriorityBadgesLabel')}:</span>{' '}
											{priorityBadgeLabelList}
										</p>
									) : null}
								</div>
								<label className="flex items-start gap-3 border-t border-[color:var(--accent)]/25 bg-black/20 px-3 py-3 text-sm text-neutral-100">
									<input
										type="checkbox"
										checked={confirmedPriorityOverride}
										onChange={(event) => setConfirmedPriorityOverride(event.target.checked)}
										className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)]"
									/>
									<span>{t('regularJoinModalPriorityCheckbox')}</span>
								</label>
							</div>
						) : null}
					</div>

					<div className="mt-6 flex flex-wrap justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 bg-white/5 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-white/10"
						>
							{t('regularJoinModalCancel')}
						</button>
						<button
							type="button"
							disabled={!canConfirm || busy}
							onClick={onConfirm}
							className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{busy && pendingActionId === 'join-regular' ? t('actionWorking') : t('regularJoinModalConfirm')}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function EpisodeUnitSlottingCard({ unitTag, unitSideId, unitSlotsAllocated, slotting, t }: {
	unitTag: string;
	unitSideId: string | null;
	unitSlotsAllocated: number;
	slotting: GameMissionDetail['slotting'];
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const normalizedTag = unitTag.toLowerCase();
	let used = 0;
	for (const side of slotting.sides)
		for (const squad of side.squads)
			for (const slot of squad.slots)
				if (slot.occupant?.type === 'placeholder' && slot.occupant.label.toLowerCase() === normalizedTag)
					used++;
	const sideName = (() => { const s = slotting.sides.find((s) => s.id === unitSideId); return s ? sideDisplayName(s) : ''; })();

	return (
		<div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1">
					<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">{t('unitSlottingTitle')}</p>
					<p className="text-sm text-emerald-100/80">
						{t('unitSlottingSubtitle', { unitTag, sideName })}
					</p>
				</div>
				<span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1.5 text-sm font-semibold text-emerald-300">
					{t('unitSlottingSlotsCounter', { used, total: unitSlotsAllocated })}
				</span>
			</div>
		</div>
	);
}

function SlottingSection({
	mission,
	busy,
	pendingActionId,
	runAction,
	confirmAction,
	guideShow,
	t
}: {
	mission: GameMissionDetail;
	busy: boolean;
	pendingActionId: string | null;
	runAction: RunAction;
	confirmAction: (pending: { kind: 'switch' | 'leave-slot' | 'leave-regular'; action: () => void }) => void;
	guideShow: () => void;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const router = useRouter();
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const [isRefreshing, startRefresh] = useTransition();
	const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
	const refreshSlotting = () => startRefresh(() => router.refresh());

	const {
		episodes, hasMultipleEpisodes, selectedEpisode, setSelectedEpisode, displayedMission,
		canLeavePrioritySlot, heldSlotSummary: episodeHeldSlotSummary, slottingSummary: episodeSlottingSummary,
		unclaimedEpisodes, unclaimedHintKey, isUnitLeader, viewerUnitTag,
		showEpisodeReminder, dismissReminder
	} = useEpisodeSlotting(mission);

	return (
		<>
		<section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h3 className="text-lg font-semibold tracking-tight text-neutral-50">{t('slottingTitle')}</h3>
					<p className="mt-1 text-sm text-neutral-300">{t('slottingSubtitle')}</p>
				</div>
				<div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
					<HelpButton onClick={guideShow} label={t('guideOpenButton')} />
					<button
						type="button"
						disabled={isRefreshing}
						onClick={refreshSlotting}
						className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5${isRefreshing ? ' animate-spin' : ''}`}>
							<path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-10.624-3.85a5.5 5.5 0 019.201-2.465l.312.31H11.77a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.535a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 002.63 7.395a.75.75 0 101.449.39z" clipRule="evenodd" />
						</svg>
						{t('slottingRefresh')}
					</button>
					<button
						type="button"
						onClick={() => setIsFullscreenOpen(true)}
						className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 sm:min-h-0 sm:w-auto"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
							<path d="M3.75 3A.75.75 0 0 0 3 3.75v3.5a.75.75 0 0 0 1.5 0V5.56l3.22 3.22a.75.75 0 1 0 1.06-1.06L5.56 4.5h1.69a.75.75 0 0 0 0-1.5h-3.5Zm9 0a.75.75 0 0 0 0 1.5h1.69l-3.22 3.22a.75.75 0 1 0 1.06 1.06l3.22-3.22v1.69a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 16.25 3h-3.5ZM8.78 11.22a.75.75 0 0 0-1.06 0L4.5 14.44v-1.69a.75.75 0 0 0-1.5 0v3.5c0 .414.336.75.75.75h3.5a.75.75 0 0 0 0-1.5H5.56l3.22-3.22a.75.75 0 0 0 0-1.06Zm2.44 0a.75.75 0 0 0 0 1.06l3.22 3.22h-1.69a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 0-1.5 0v1.69l-3.22-3.22a.75.75 0 0 0-1.06 0Z" />
						</svg>
						{t('slottingFullscreenOpen')}
					</button>
					<span className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1.5 text-sm font-semibold text-neutral-300 sm:min-h-0 sm:w-auto">
						{t('priorityAvailability', { count: countPriorityAvailable(displayedMission.slotting) })}
					</span>
				</div>
			</div>

			<div className="mt-4 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-2">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{t('slottingHeldTitle')}</p>
						{episodeHeldSlotSummary ? (
							<>
								<div className="flex flex-wrap items-center gap-2 text-sm text-neutral-100">
									<span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: episodeHeldSlotSummary.sideColor }} />
									<span className="font-semibold">{episodeHeldSlotSummary.sideName}</span>
									<span className="text-neutral-500">/</span>
									<span className="font-semibold">{episodeHeldSlotSummary.squadName}</span>
									<span className="text-neutral-500">/</span>
									<span>{t('slottingHeldRowLabel', { row: String(episodeHeldSlotSummary.rowIndex).padStart(2, '0') })}</span>
								</div>
								<p className="text-sm text-neutral-300">{episodeHeldSlotSummary.role}</p>
							</>
						) : (
							<p className="text-sm text-neutral-400">{t('slottingHeldEmpty')}</p>
						)}
					</div>
					{canLeavePrioritySlot ? (
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								confirmAction({
									kind: 'leave-slot',
									action: () => void runAction({
										id: 'leave-slot',
										path: `/api/games/${mission.shortCode}/leave-slot`,
										body: { episodeNumber: selectedEpisode }
									})
								});
							}}
							className="inline-flex min-h-11 items-center rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{pendingActionId === 'leave-slot' ? t('actionWorking') : t('leaveSlot')}
						</button>
					) : null}
				</div>
			</div>

			{mission.status === 'published' ? (
				<div className="mt-4 grid gap-2">
					{mission.unitSlottingOpen ? (
						<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
							<p className="text-xs text-emerald-200">{t('slottingPhaseUnit')}</p>
						</div>
					) : null}
					{mission.priorityClaimOpen ? (
						<div className="rounded-xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/5 px-4 py-2.5">
							<p className="text-xs text-[color:var(--accent)]">{t('slottingPhasePriorityOpen', { count: countPriorityAvailable(displayedMission.slotting) })}</p>
						</div>
					) : mission.priorityClaimOpensAt && !mission.priorityGameplayReleasedAt ? (
						<div className="rounded-xl border border-neutral-800 bg-white/[0.02] px-4 py-2.5">
							<p className="text-xs text-neutral-400">{t('slottingPhasePriorityScheduled', { date: formatViewerDate(mission.priorityClaimOpensAt, locale, timeZone, hourCycle) ?? mission.priorityClaimOpensAt })}</p>
						</div>
					) : null}
					{mission.regularJoinOpen ? (
						<div className="rounded-xl border border-neutral-800 bg-white/[0.02] px-4 py-2.5">
							<p className="text-xs text-neutral-400">{t('slottingPhaseRegularOpen')}</p>
						</div>
					) : null}
				</div>
			) : null}

			{mission.viewer.serverBanned ? (
				<div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5">
					<p className="text-xs text-red-300">{t('serverBannedNotice')}</p>
				</div>
			) : null}

			{mission.viewer.isUnitLeader && mission.viewer.unitTag && mission.unitSlottingOpen ? (
				<EpisodeUnitSlottingCard unitTag={mission.viewer.unitTag} unitSideId={mission.viewer.unitSideId} unitSlotsAllocated={mission.viewer.unitSlotsAllocated} slotting={displayedMission.slotting} t={t} />
			) : null}

			{hasMultipleEpisodes ? (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-1.5">
						{episodes.map((ep) => {
							const isUnclaimed = unclaimedEpisodes.includes(ep.episodeNumber);
							return (
								<button
									key={ep.episodeNumber}
									type="button"
									onClick={() => setSelectedEpisode(ep.episodeNumber)}
									className={`relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all ${
										selectedEpisode === ep.episodeNumber
											? 'bg-[color:var(--accent)] text-neutral-950 shadow-sm shadow-[color:var(--accent)]/25'
											: 'bg-neutral-900 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
									}`}
								>
									{t('episodeTabLabel', { number: ep.episodeNumber })}
									{isUnclaimed ? (
										<span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
									) : null}
								</button>
							);
						})}
					</div>
					{unclaimedHintKey && unclaimedEpisodes.length > 0 ? (
						<p className="text-xs text-amber-300/80">{t(unclaimedHintKey, { count: unclaimedEpisodes.length, unitTag: viewerUnitTag ?? '' })}</p>
					) : null}
				</div>
			) : null}

			<SlottingBoards
				mission={displayedMission}
				episodeNumber={selectedEpisode}
				busy={busy}
				pendingActionId={pendingActionId}
				runAction={runAction}
				confirmAction={confirmAction}
				t={t}
				className="mt-6 grid gap-6"
			/>

			<div className="mt-8 grid gap-3">
				<div>
					<h4 className="text-base font-semibold tracking-tight text-neutral-100">{t('slottingSummaryTitle')}</h4>
					<p className="mt-1 text-sm text-neutral-400">{t('slottingSummarySubtitle')}</p>
				</div>
				<div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/70">
					<table className="min-w-[44rem] w-full border-separate border-spacing-0">
						<thead>
							<tr>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummarySideCol')}</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummarySquadCol')}</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummaryUnitSlotsCol')}</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummaryPriorityCol')}</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummaryRegularCol')}</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('slottingSummaryYouCol')}</th>
							</tr>
						</thead>
						<tbody>
							{episodeSlottingSummary.map((side) => (
								<Fragment key={side.sideId}>
									{side.squads.map((squad, i) => (
										<tr key={`${side.sideId}-${squad.squadId}`} className="odd:bg-white/[0.015]">
											{i === 0 ? (
												<td rowSpan={side.squads.length + 1} className="border-t border-neutral-800 px-3 py-2 align-top text-sm text-neutral-200">
													<span className="inline-flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: side.sideColor }} />
														{side.sideName}
													</span>
												</td>
											) : null}
											<td className="border-t border-neutral-800 px-3 py-2 text-sm font-semibold text-neutral-100">{squad.squadName}</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{squad.squadSlotTeams.length > 0
													? squad.squadSlotTeams.map((e) => `${e.team} × ${e.count}`).join(', ')
													: <span className="text-neutral-500">0</span>}
											</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{t('slottingSummaryOpenTaken', { open: squad.priorityOpen, taken: squad.priorityTaken })}
											</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{t('slottingSummaryOpenTaken', { open: squad.regularOpen, taken: squad.regularTaken })}
											</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm">
												{squad.hasViewerSlot ? (
													<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--accent)]">
														{t('slottingSummaryYouHere')}
													</span>
												) : (
													<span className="text-neutral-500">{t('slottingSummaryYouNone')}</span>
												)}
											</td>
										</tr>
									))}
									<tr key={`${side.sideId}-total`} className="bg-white/[0.04]">
										<td className="border-t border-neutral-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
											{t('slottingSummaryTotal', { count: side.totalSlots })}
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{side.squadSlotTeams.length > 0
												? side.squadSlotTeams.map((e) => `${e.team} × ${e.count}`).join(', ')
												: '0'}
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{t('slottingSummarySlotsTaken', { total: side.prioritySlots, taken: side.priorityTaken })}
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{t('slottingSummarySlotsTaken', { total: side.regularSlots, taken: side.regularTaken })}
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm">
											{side.hasViewerSlot ? (
												<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--accent)]">
													{t('slottingSummaryYouHere')}
												</span>
											) : (
												<span className="text-neutral-500">{t('slottingSummaryYouNone')}</span>
											)}
										</td>
									</tr>
								</Fragment>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>

		{isFullscreenOpen && typeof document !== 'undefined'
			? createPortal(
				<SlottingFullscreenOverlay
					mission={displayedMission}
					episodes={episodes}
					selectedEpisode={selectedEpisode}
					onSelectedEpisodeChange={setSelectedEpisode}
					busy={busy}
					pendingActionId={pendingActionId}
					runAction={runAction}
					confirmAction={confirmAction}
					isRefreshing={isRefreshing}
					onRefresh={refreshSlotting}
					onClose={() => setIsFullscreenOpen(false)}
					t={t}
				/>,
				document.body
			)
			: null}

		{showEpisodeReminder && unclaimedEpisodes.length > 0 && typeof document !== 'undefined'
			? createPortal(
				<EpisodeReminderModal
					episodes={unclaimedEpisodes}
					isUnitLeader={isUnitLeader}
					unitTag={viewerUnitTag}
					onGoToEpisode={(ep) => {
						setSelectedEpisode(ep);
						dismissReminder(false);
					}}
					onDismiss={dismissReminder}
					t={t}
				/>,
				document.body
			)
			: null}
		</>
	);
}

function EpisodeReminderModal({ episodes, isUnitLeader, unitTag, onGoToEpisode, onDismiss, t }: {
	episodes: number[];
	isUnitLeader: boolean;
	unitTag: string | null;
	onGoToEpisode: (ep: number) => void;
	onDismiss: (dontShowAgain: boolean) => void;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const [dontShowAgain, setDontShowAgain] = useState(false);

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="mx-4 w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950 p-6 shadow-2xl shadow-black/40">
				<h3 className="text-base font-semibold text-neutral-50">
					{isUnitLeader
						? t('episodeReminderTitleUnit', { unitTag: unitTag ?? '' })
						: t('episodeReminderTitlePriority')
					}
				</h3>
				<p className="mt-2 text-sm text-neutral-400">
					{isUnitLeader
						? t('episodeReminderBodyUnit', { count: episodes.length })
						: t('episodeReminderBodyPriority', { count: episodes.length })
					}
				</p>

				<div className="mt-4 flex flex-wrap gap-2">
					{episodes.map((ep) => (
						<button
							key={ep}
							type="button"
							onClick={() => onGoToEpisode(ep)}
							className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-sm font-semibold text-neutral-950 transition hover:brightness-110"
						>
							{t('episodeTabLabel', { number: ep })}
						</button>
					))}
				</div>

				<div className="mt-5 flex items-center justify-between gap-4">
					<label className="flex items-center gap-2 text-xs text-neutral-500">
						<input
							type="checkbox"
							checked={dontShowAgain}
							onChange={(e) => setDontShowAgain(e.target.checked)}
							className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-900 text-[color:var(--accent)]"
						/>
						{t('episodeReminderDontShowAgain')}
					</label>
					<button
						type="button"
						onClick={() => onDismiss(dontShowAgain)}
						className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800"
					>
						{t('episodeReminderDismiss')}
					</button>
				</div>
			</div>
		</div>
	);
}

function SlottingBoards({
	mission,
	episodeNumber = 1,
	busy,
	pendingActionId,
	runAction,
	confirmAction,
	t,
	className = 'grid gap-6'
}: {
	mission: GameMissionDetail;
	episodeNumber?: number;
	busy: boolean;
	pendingActionId: string | null;
	runAction: RunAction;
	confirmAction: (pending: { kind: 'switch' | 'leave-slot' | 'leave-regular'; action: () => void }) => void;
	t: ReturnType<typeof useTranslations<'games'>>;
	className?: string;
}) {
	const viewer = mission.viewer;
	const isUnitLeaderOnMission = viewer.isUnitLeader && viewer.unitSideId && mission.unitSlottingOpen;

	return (
		<div className={className}>
			{mission.slotting.sides.map((side) => {
				const sideRows = buildSideRows(side);
				const boardWidthRem = slottingTableWidthRem(side.squads.length);

				return (
					<section
						key={side.id}
						className="overflow-hidden rounded-3xl border bg-white/[0.02]"
						style={{ borderColor: `${side.color}55` }}
					>
						<div className="flex items-center gap-3 border-b border-neutral-800/80 px-4 py-4">
							<span className="h-3 w-3 rounded-full" style={{ backgroundColor: side.color }} />
							<h4 className="text-lg font-semibold text-neutral-50">{sideDisplayName(side)}</h4>
						</div>

						<SyncedHorizontalScroll contentWidthRem={boardWidthRem}>
							<table className="table-fixed border-separate border-spacing-0" style={{ width: `${boardWidthRem}rem` }}>
								<colgroup>
									<col style={{ width: `${SLOTTING_INDEX_COLUMN_REM}rem` }} />
									{side.squads.map((squad) => (
										<col key={`col-${squad.id}`} style={{ width: `${SLOTTING_SQUAD_COLUMN_REM}rem` }} />
									))}
								</colgroup>
								<thead>
									<tr>
										<th className="sticky left-0 z-20 w-14 border-b border-r border-neutral-800 bg-neutral-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
											#
										</th>
										{side.squads.map((squad) => (
											<th key={squad.id} className="border-b border-neutral-800 bg-neutral-950/80 px-3 py-3 text-left align-top">
												<div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-300">{squad.name}</div>
												<SquadAssetsBadge assets={squad.assets ?? []} t={t} />
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{sideRows.map((row) => (
										<tr key={`${side.id}-${row.index}`}>
											<th className="sticky left-0 z-10 w-14 border-r border-t border-neutral-800 bg-neutral-950 px-3 py-4 text-left align-top text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
												{String(row.index + 1).padStart(2, '0')}
											</th>
											{row.slots.map((slot, squadIndex) => {
												if (!slot) {
													return (
														<td key={`${side.id}-${row.index}-${squadIndex}`} className="border-t border-neutral-800 p-2 align-top">
															<div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-black/10 text-lg text-neutral-700">
																-
															</div>
														</td>
													);
												}

												const canClaim =
													mission.status === 'published' &&
													slot.access === 'priority' &&
													slot.occupant === null &&
													viewer.canClaimPriority;
												const canSwitch =
													mission.status === 'published' &&
													slot.access === 'priority' &&
													slot.occupant === null &&
													viewer.canSwitchPriority;

												const isOwnUnit =
													isUnitLeaderOnMission &&
													slot.occupant?.type === 'placeholder' &&
													slot.occupant.label.toLowerCase() === (viewer.unitTag ?? '').toLowerCase();
												const canUnitClaim =
													isUnitLeaderOnMission &&
													slot.access === 'unit' &&
													slot.occupant === null &&
													side.id === viewer.unitSideId &&
													viewer.canClaimUnitSlot;
												const canUnitRelease =
													isUnitLeaderOnMission &&
													slot.access === 'unit' &&
													isOwnUnit;

												const unitClaimProps = (canUnitClaim || canUnitRelease) ? {
													canClaim: !!canUnitClaim,
													canRelease: !!canUnitRelease,
													isBusy: busy && (pendingActionId === `unit-claim-${slot.id}` || pendingActionId === `unit-release-${slot.id}`),
													unitTag: viewer.unitTag ?? '',
													onClaim: () => {
														void runAction({
															id: `unit-claim-${slot.id}`,
															path: `/api/games/${mission.shortCode}/claim-unit`,
															body: { slotId: slot.id, episodeNumber }
														});
													},
													onRelease: () => {
														void runAction({
															id: `unit-release-${slot.id}`,
															path: `/api/games/${mission.shortCode}/release-unit`,
															body: { slotId: slot.id, episodeNumber }
														});
													}
												} : null;

												return (
													<td key={slot.id} className="border-t border-neutral-800 p-2 align-top">
														<SlotCell
															slot={slot}
															isHeldByViewer={viewer.heldSlotId === slot.id}
															canClaim={canClaim}
															canSwitch={canSwitch}
															canLeave={
																mission.status === 'published' &&
																viewer.heldSlotAccess === 'priority' &&
																viewer.heldSlotId === slot.id
															}
															isBusy={busy && pendingActionId === slot.id}
															isLeaveBusy={busy && pendingActionId === 'leave-slot'}
															disableActions={busy}
															onClaim={() => {
																void runAction({
																	id: slot.id,
																	path: `/api/games/${mission.shortCode}/claim`,
																	body: { slotId: slot.id, episodeNumber }
																});
															}}
															onSwitch={() => {
																confirmAction({
																	kind: 'switch',
																	action: () => void runAction({
																		id: slot.id,
																		path: `/api/games/${mission.shortCode}/switch-slot`,
																		body: { slotId: slot.id, episodeNumber }
																	})
																});
															}}
															onLeave={() => {
																confirmAction({
																	kind: 'leave-slot',
																	action: () => void runAction({
																		id: 'leave-slot',
																		path: `/api/games/${mission.shortCode}/leave-slot`,
																		body: { episodeNumber }
																	})
																});
															}}
															unitClaim={unitClaimProps}
															t={t}
														/>
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</SyncedHorizontalScroll>
					</section>
				);
			})}
		</div>
	);
}

function SlottingFullscreenOverlay({
	mission,
	episodes = [],
	selectedEpisode = 1,
	onSelectedEpisodeChange,
	busy,
	pendingActionId,
	runAction,
	confirmAction,
	isRefreshing,
	onRefresh,
	onClose,
	t
}: {
	mission: GameMissionDetail;
	episodes?: Array<{ episodeNumber: number; slotting: GameMissionDetail['slotting']; slottingRevision: number }>;
	selectedEpisode?: number;
	onSelectedEpisodeChange?: (ep: number) => void;
	busy: boolean;
	pendingActionId: string | null;
	runAction: RunAction;
	confirmAction: (pending: { kind: 'switch' | 'leave-slot' | 'leave-regular'; action: () => void }) => void;
	isRefreshing: boolean;
	onRefresh: () => void;
	onClose: () => void;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const activeEpisodeData = episodes.find((e) => e.episodeNumber === selectedEpisode);
	const fsEpisodeHeldSlotId = activeEpisodeData
		? findUserHeldSlotId(activeEpisodeData.slotting, mission.viewer.userId)
		: mission.viewer.heldSlotId;
	const fsEpisodeHeldSlotAccess = activeEpisodeData
		? findSlotAccess(activeEpisodeData.slotting, fsEpisodeHeldSlotId)
		: mission.viewer.heldSlotAccess;
	const fsEpisodeUnitSideId = mission.viewer.unitSideByEpisode?.[selectedEpisode] ?? mission.viewer.unitSideId;
	const displayedMission = activeEpisodeData
		? {
			...mission,
			slotting: activeEpisodeData.slotting,
			slottingRevision: activeEpisodeData.slottingRevision,
			viewer: {
				...mission.viewer,
				heldSlotId: fsEpisodeHeldSlotId,
				heldSlotAccess: fsEpisodeHeldSlotAccess,
				unitSideId: fsEpisodeUnitSideId,
				canClaimPriority: mission.viewer.hasPriorityBadge && mission.priorityClaimOpen && !fsEpisodeHeldSlotId,
				canSwitchPriority: mission.priorityClaimOpen && fsEpisodeHeldSlotAccess === 'priority',
				canClaimUnitSlot: mission.viewer.isUnitLeader && mission.unitSlottingOpen && fsEpisodeUnitSideId != null
			}
		}
		: mission;
	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [onClose]);

	return (
		<div role="dialog" aria-modal="true" aria-labelledby="slotting-fullscreen-title" className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm">
			<div className="flex h-full flex-col bg-neutral-950/95">
				<div className="border-b border-neutral-800 px-4 py-4 sm:px-6">
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<h3 id="slotting-fullscreen-title" className="text-lg font-semibold tracking-tight text-neutral-50">{t('slottingTitle')}</h3>
							<p className="mt-1 text-sm text-neutral-300">{t('slottingSubtitle')}</p>
						</div>
						<div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
							<button
								type="button"
								disabled={isRefreshing}
								onClick={onRefresh}
								className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5${isRefreshing ? ' animate-spin' : ''}`}>
									<path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-10.624-3.85a5.5 5.5 0 019.201-2.465l.312.31H11.77a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.535a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 002.63 7.395a.75.75 0 101.449.39z" clipRule="evenodd" />
								</svg>
								{t('slottingRefresh')}
							</button>
							<span className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1.5 text-sm font-semibold text-neutral-300 sm:min-h-0 sm:w-auto">
								{t('priorityAvailability', { count: countPriorityAvailable(displayedMission.slotting) })}
							</span>
							<button
								type="button"
								onClick={onClose}
								className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 sm:min-h-0 sm:w-auto"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
									<path fillRule="evenodd" d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
								</svg>
								{t('slottingFullscreenClose')}
							</button>
						</div>
					</div>
				</div>

				{episodes.length > 1 && onSelectedEpisodeChange ? (
					<div className="border-b border-neutral-800 px-4 py-2 sm:px-6">
						<div className="flex items-center gap-1.5">
							{episodes.map((ep) => (
								<button
									key={ep.episodeNumber}
									type="button"
									onClick={() => onSelectedEpisodeChange(ep.episodeNumber)}
									className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all ${
										selectedEpisode === ep.episodeNumber
											? 'bg-[color:var(--accent)] text-neutral-950 shadow-sm shadow-[color:var(--accent)]/25'
											: 'bg-neutral-900 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
									}`}
								>
									{t('episodeTabLabel', { number: ep.episodeNumber })}
								</button>
							))}
						</div>
					</div>
				) : null}

				<div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
					<SlottingBoards
						mission={displayedMission}
						episodeNumber={selectedEpisode}
						busy={busy}
						pendingActionId={pendingActionId}
						runAction={runAction}
						confirmAction={confirmAction}
						t={t}
					/>
				</div>
			</div>
		</div>
	);
}

function ResultsSection({
	archiveResult,
	archiveStatus,
	archiveReason,
	sides,
	t
}: {
	archiveResult: GameArchiveResult;
	archiveStatus: GameArchiveStatus | null;
	archiveReason: string | null;
	sides: GameMissionDetail['slotting']['sides'];
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const sideColorMap = new Map(sides.map((side) => [side.id, side.color]));
	const scores = archiveResult.sideScores;
	const isCanceled = archiveStatus === 'canceled';

	return (
		<div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
			<div className="relative grid gap-4">
				<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
					{t('archiveResultLabel')}
				</p>

				{isCanceled ? (
					<div className="grid gap-2">
						<p className="text-lg font-semibold text-red-300">{t('canceledBadge')}</p>
						{archiveReason ? (
							<p className="text-sm text-neutral-400">{archiveReason}</p>
						) : null}
					</div>
				) : scores.length >= 2 ? (
					<div className="grid gap-4">
						<div className="flex items-center justify-center gap-3 sm:gap-5">
							{scores.map((score, index) => {
								const color = sideColorMap.get(score.sideId) ?? '#888888';
								return (
									<Fragment key={score.sideId}>
										{index > 0 ? (
											<span className="text-lg font-semibold text-neutral-600">:</span>
										) : null}
										<span
											className="text-5xl font-bold tabular-nums drop-shadow-[0_0_14px_currentColor] sm:text-6xl"
											style={{ color }}
										>
											{score.score}
										</span>
									</Fragment>
								);
							})}
						</div>

						<div className="flex items-center justify-center">
							{archiveResult.outcome === 'draw' ? (
								<span className="inline-flex items-center rounded-full border border-neutral-700 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">
									{t('archiveResultDraw')}
								</span>
							) : archiveResult.winnerSideId ? (
								<span
									className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]"
									style={{
										color: sideColorMap.get(archiveResult.winnerSideId) ?? '#888888',
										borderColor: `${sideColorMap.get(archiveResult.winnerSideId) ?? '#888888'}40`,
										backgroundColor: `${sideColorMap.get(archiveResult.winnerSideId) ?? '#888888'}15`
									}}
								>
									{t('archiveResultWinner', {
										side: scores.find((s) => s.sideId === archiveResult.winnerSideId)?.sideName ?? archiveResult.winnerSideId
									})}
								</span>
							) : null}
						</div>
					</div>
				) : scores.length === 1 ? (
					<p className="text-center text-sm text-neutral-300">
						{scores[0].sideName}: {scores[0].score}
					</p>
				) : (
					<p className="text-sm text-neutral-400">{t('archiveNoResult')}</p>
				)}
			</div>
		</div>
	);
}

function HelpButton({ onClick, label }: { onClick: () => void; label: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
				<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
			</svg>
			{label}
		</button>
	);
}
