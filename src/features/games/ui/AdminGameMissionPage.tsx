'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { parseAdminBadgesResponse, parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import type { AdminBadgeType } from '@/features/admin/domain/types';
import { AdminButton, AdminDisclosure, AdminGate, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import {
	parseAdminGameAuditResponse,
	parseAdminGameMissionResponse,
	type AdminGamesValidationIssue,
	type AdminGameMissionDetail,
	type AdminGamesErrorView
} from '@/features/games/domain/api';
import type { GameAuditEvent, GamePublishValidationError, GameSlottingDestructiveChange } from '@/features/games/domain/types';
import { sideDisplayName } from '@/features/games/domain/slotting';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { SlottingEditor } from './SlottingEditor';
import { formatMissionUpdateMessage } from './missionPageUtils';

type SideSummary = { id: string; name: string; displayName?: string };

/** Collect unique sides across all episodes (deduped by id). */
function collectAllSides(mission: AdminGameMissionDetail): SideSummary[] {
	const seen = new Map<string, SideSummary>();
	for (const ep of mission.episodeSlottings ?? []) {
		for (const side of ep.slotting.sides) {
			if (!seen.has(side.id)) {
				seen.set(side.id, { id: side.id, name: side.name, displayName: side.displayName });
			}
		}
	}
	if (seen.size === 0) {
		for (const side of mission.slotting.sides) {
			seen.set(side.id, { id: side.id, name: side.name, displayName: side.displayName });
		}
	}
	return Array.from(seen.values());
}

type SettingsFormState = {
	title: string;
	descriptionEn: string;
	descriptionRu: string;
	descriptionUk: string;
	descriptionAr: string;
	shortCode: string;
	startsAt: string;
	serverName: string;
	serverHost: string;
	serverPort: string;
	earlyPassword: string;
	finalPassword: string;
	priorityClaimOpensAt: string;
	priorityClaimManualState: 'default' | 'open' | 'closed';
	unitSlottingManualState: 'closed' | 'open';
	regularJoinEnabled: boolean;
	serverDetailsHidden: boolean;
	priorityBadgeTypeIds: number[];
	skipPriorityDiscord: boolean;
};

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function toLocalInputValue(iso: string | null) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const offset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function getNextSunday1445Utc(): string {
	const now = new Date();
	const day = now.getUTCDay();
	let daysUntilSunday = (7 - day) % 7;
	if (daysUntilSunday === 0) {
		const pastTime = now.getUTCHours() > 14 || (now.getUTCHours() === 14 && now.getUTCMinutes() >= 45);
		if (pastTime) daysUntilSunday = 7;
	}
	const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 14, 45, 0));
	return toLocalInputValue(target.toISOString());
}

function startsAtMinus24h(startsAt: string): string {
	const date = new Date(startsAt);
	if (Number.isNaN(date.getTime())) return '';
	const utc = new Date(date.getTime() - 24 * 60 * 60 * 1000);
	return toLocalInputValue(utc.toISOString());
}

function formatErrorCode(code: string) {
	return code.replace(/_/g, ' ');
}

function getSettingsFieldLabel(
	fieldName: string | null,
	t: ReturnType<typeof useTranslations<'admin'>>
): string | null {
	if (fieldName === 'title') return t('gamesFieldTitle');
	if (fieldName === 'description') return t('gamesFieldDescriptionEn');
	if (fieldName === 'shortCode') return t('gamesFieldShortCode');
	if (fieldName === 'startsAt') return t('gamesFieldStartsAt');
	if (fieldName === 'serverName') return t('gamesFieldServerName');
	if (fieldName === 'serverHost') return t('gamesFieldServerHost');
	if (fieldName === 'serverPort') return t('gamesFieldServerPort');
	if (fieldName === 'priorityClaimOpensAt') return t('gamesFieldPriorityOpensAt');
	if (fieldName === 'priorityBadgeTypeIds') return t('gamesFieldPriorityBadgeIds');
	return null;
}

function formatSettingsValidationIssue(
	issue: AdminGamesValidationIssue,
	t: ReturnType<typeof useTranslations<'admin'>>
): string {
	const fieldName = typeof issue.path[0] === 'string' ? issue.path[0] : null;
	const fieldLabel = getSettingsFieldLabel(fieldName, t);

	if (fieldName === 'serverPort') {
		if (issue.code === 'too_big' && typeof issue.maximum === 'number') {
			return `${fieldLabel ?? 'Server port'}: must be ${issue.maximum} or less`;
		}
		if (issue.code === 'too_small' && typeof issue.minimum === 'number') {
			return `${fieldLabel ?? 'Server port'}: must be at least ${issue.minimum}`;
		}
		return `${fieldLabel ?? 'Server port'}: invalid value`;
	}

	if (fieldName === 'shortCode') {
		return `${fieldLabel ?? 'Short code'}: letters, numbers, and hyphens only`;
	}

	if (fieldName === 'startsAt' || fieldName === 'priorityClaimOpensAt') {
		return `${fieldLabel ?? 'Date/time'}: invalid date/time`;
	}

	if (fieldLabel) {
		return `${fieldLabel}: invalid value`;
	}

	return 'Invalid settings value';
}

function formatSettingsValidationDetails(
	issues: AdminGamesValidationIssue[],
	t: ReturnType<typeof useTranslations<'admin'>>
): string {
	const uniqueMessages = new Set<string>();
	for (const issue of issues) {
		uniqueMessages.add(formatSettingsValidationIssue(issue, t));
	}
	return [...uniqueMessages].slice(0, 3).join('; ');
}

function formatPublishReason(reason: GamePublishValidationError) {
	return reason.replace(/_/g, ' ');
}

function formatDestructiveChange(change: GameSlottingDestructiveChange) {
	return `${change.sideName} / ${change.squadName} / ${change.role} (${change.reason.replace(/_/g, ' ')})`;
}

function formatAuditPayload(payload: GameAuditEvent['payload']): string {
	if (payload === null) return 'null';
	if (typeof payload === 'string') return payload;
	return JSON.stringify(payload, null, 2);
}

function missionToSettingsForm(mission: AdminGameMissionDetail): SettingsFormState {
	return {
		title: mission.title,
		descriptionEn: mission.description.en,
		descriptionRu: mission.description.ru,
		descriptionUk: mission.description.uk,
		descriptionAr: mission.description.ar,
		shortCode: mission.shortCode ?? '',
		startsAt: toLocalInputValue(mission.startsAt),
		serverName: mission.serverName,
		serverHost: mission.serverHost,
		serverPort: mission.serverPort ? String(mission.serverPort) : '',
		earlyPassword: mission.earlyPassword ?? '',
		finalPassword: mission.finalPassword ?? '',
		priorityClaimOpensAt: toLocalInputValue(mission.priorityClaimOpensAt),
		priorityClaimManualState: mission.priorityClaimManualState,
		unitSlottingManualState: mission.unitSlottingManualState,
		regularJoinEnabled: mission.regularJoinEnabled,
		serverDetailsHidden: mission.serverDetailsHidden,
		priorityBadgeTypeIds: mission.priorityBadgeTypeIds,
		skipPriorityDiscord: mission.skipPriorityDiscord
	};
}

function renderStateBadge(label: string, tone: 'accent' | 'neutral' | 'success' | 'danger') {
	const tones = {
		accent: 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]',
		neutral: 'border-neutral-800 bg-white/5 text-neutral-300',
		success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		danger: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${tones[tone]}`}>
			{label}
		</span>
	);
}

function formatMissionStatusLabel(mission: AdminGameMissionDetail, t: ReturnType<typeof useTranslations<'admin'>>) {
	if (mission.status === 'draft') return t('gamesStatus.draft');
	if (mission.status === 'published') return t('gamesStatus.published');
	return t('gamesStatus.archived');
}

const editorSectionClass = 'grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20';
const editorCardClass = 'rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4';
const editorInputClass =
	'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';
const editorDateTimeClass =
	`${editorInputClass} [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:invert`;
const editorTextAreaClass = `${editorInputClass} resize-y`;
const editorMonoTextAreaClass = `${editorInputClass} font-mono text-sm`;

async function fetchAdminStatus(): Promise<AdminStatus> {
	try {
		const res = await fetch('/api/admin/status', { cache: 'no-store' });
		const json: unknown = (await res.json()) as unknown;
		return parseAdminStatusResponse(json) ?? { connected: false, isAdmin: false };
	} catch {
		return { connected: false, isAdmin: false };
	}
}

function ImageUploadArea({ mission, ta, setFeedback, onImageChanged }: {
	mission: AdminGameMissionDetail;
	ta: ReturnType<typeof useTranslations<'admin'>>;
	setFeedback: (fb: { tone: 'success' | 'error'; message: string } | null) => void;
	onImageChanged: (m: AdminGameMissionDetail) => void;
}) {
	return (
		<div className="grid gap-2">
			<span className="text-sm text-neutral-300">{ta('gamesMissionImageLabel')}</span>
			<p className="text-xs text-neutral-500">{ta('gamesMissionImageHelp')}</p>
			<div className="flex items-center gap-3">
				{mission.imageMime ? (
					<img
						src={`/api/admin/games/${mission.id}/image?v=${encodeURIComponent(mission.updatedAt)}`}
						alt=""
						className="h-20 max-w-[160px] rounded border border-neutral-700 object-cover"
					/>
				) : (
					<div className="flex h-20 w-[160px] items-center justify-center rounded border border-dashed border-neutral-700 text-xs text-neutral-500">
						{ta('gamesMissionImageEmpty')}
					</div>
				)}
				<div className="flex flex-col gap-2">
					<label className="cursor-pointer text-sm text-[color:var(--accent)] hover:underline">
						{ta('gamesMissionImageUpload')}
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							className="hidden"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (!file) return;
								const reader = new FileReader();
								reader.onload = async () => {
									const base64 = (reader.result as string).split(',')[1];
									const mime = file.type as 'image/png' | 'image/jpeg' | 'image/webp';
									try {
										const res = await fetch(`/api/admin/games/${mission.id}/image`, {
											method: 'POST',
											headers: { 'content-type': 'application/json' },
											body: JSON.stringify({ data: base64, mime })
										});
										if (res.ok) {
											const refreshRes = await fetch(`/api/admin/games/${mission.id}`, { headers: { Accept: 'application/json' } });
											if (refreshRes.ok) {
												const refreshData = parseAdminGameMissionResponse(await refreshRes.json());
												if (refreshData && 'mission' in refreshData) onImageChanged(refreshData.mission);
											}
										} else {
											const data = await res.json() as { error?: string };
											setFeedback({ tone: 'error', message: data?.error === 'too_large' ? ta('gamesMissionImageTooLarge') : ta('gamesMissionImageUploadFailed') });
										}
									} catch {
										setFeedback({ tone: 'error', message: ta('gamesMissionImageUploadFailed') });
									}
								};
								reader.readAsDataURL(file);
								e.target.value = '';
							}}
						/>
					</label>
					{mission.imageMime && (
						<button
							type="button"
							className="text-left text-sm text-red-400 hover:underline"
							onClick={async () => {
								try {
									const res = await fetch(`/api/admin/games/${mission.id}/image`, { method: 'DELETE' });
									if (res.ok) {
										const refreshRes = await fetch(`/api/admin/games/${mission.id}`, { headers: { Accept: 'application/json' } });
										if (refreshRes.ok) {
											const refreshData = parseAdminGameMissionResponse(await refreshRes.json());
											if (refreshData && 'mission' in refreshData) onImageChanged(refreshData.mission);
										}
									}
								} catch {
									setFeedback({ tone: 'error', message: ta('gamesMissionImageDeleteFailed') });
								}
							}}
						>
							{ta('gamesMissionImageDelete')}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

export default function AdminGameMissionPage() {
	const ta = useTranslations('admin');
	const tg = useTranslations('games');
	const pathname = usePathname();
	const params = useParams();
	const localeParam = (params.locale as string) || 'en';
	const redirectPath = buildLocalizedPath(localeParam, pathname);
	const locale = useLocale();
	const router = useRouter();
	const missionIdParam = params.missionId as string;
	const missionId = Number(missionIdParam);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const { timeZone, hourCycle } = useViewerDateTimePreferences();
	const [mission, setMission] = useState<AdminGameMissionDetail | null>(null);
	const [missionState, setMissionState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
	const [settingsForm, setSettingsForm] = useState<SettingsFormState | null>(null);
	const [slottingText, setSlottingText] = useState('');
	const [selectedSlottingEpisode, setSelectedSlottingEpisode] = useState(1);
	const [winnerSideId, setWinnerSideId] = useState('');
	const [sideScores, setSideScores] = useState<Record<string, string>>({});
	const [cancelReason, setCancelReason] = useState('');
	const [titleConfirmation, setTitleConfirmation] = useState('');
	const [missionUpdateEpisodeNumber, setMissionUpdateEpisodeNumber] = useState('');
	const [missionUpdateTotalEpisodes, setMissionUpdateTotalEpisodes] = useState('3');
	const [editingMissionUpdateId, setEditingMissionUpdateId] = useState<number | null>(null);
	const [auditEvents, setAuditEvents] = useState<GameAuditEvent[]>([]);
	const [auditState, setAuditState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [badgeCatalog, setBadgeCatalog] = useState<AdminBadgeType[]>([]);
	const [badgeCatalogState, setBadgeCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
	const [activeAction, setActiveAction] = useState<string | null>(null);
	const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
	const [skipPublishDiscord, setSkipPublishDiscord] = useState(isLocalhost);
	const initialLoadRef = useRef(true);
	const [confirmAction, setConfirmAction] = useState<{
		title: string;
		description: string;
		confirmLabel: string;
		onConfirm: () => void;
	} | null>(null);
	const [pendingDestructiveChanges, setPendingDestructiveChanges] = useState<{
		details: string;
		onConfirm: () => void;
	} | null>(null);

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

	const syncMissionState = (nextMission: AdminGameMissionDetail) => {
		setMission(nextMission);
		const form = missionToSettingsForm(nextMission);
		if (initialLoadRef.current && isLocalhost) {
			form.skipPriorityDiscord = true;
			initialLoadRef.current = false;
		}
		setSettingsForm(form);
		const episodeData = nextMission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
		setSlottingText(JSON.stringify(episodeData?.slotting ?? nextMission.slotting, null, 2));
		setWinnerSideId(nextMission.archiveResult?.winnerSideId ?? '');
		const allSides = collectAllSides(nextMission);
		setSideScores(
			Object.fromEntries(
				allSides.map((side) => {
					const existing = nextMission.archiveResult?.sideScores.find((score) => score.sideId === side.id);
					return [side.id, existing ? String(existing.score) : ''];
				})
			)
		);
		setCancelReason(nextMission.archiveReason ?? '');
		setTitleConfirmation('');
	};

	const syncMissionLifecycle = (nextMission: AdminGameMissionDetail) => {
		setMission(nextMission);
		setSettingsForm((prev) => prev ? {
			...prev,
			priorityClaimManualState: nextMission.priorityClaimManualState,
			unitSlottingManualState: nextMission.unitSlottingManualState,
			regularJoinEnabled: nextMission.regularJoinEnabled
		} : prev);
	};

	const syncSlottingResponse = (nextMission: AdminGameMissionDetail) => {
		setMission(nextMission);
		const episodeData = nextMission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
		setSlottingText(JSON.stringify(episodeData?.slotting ?? nextMission.slotting, null, 2));
	};

	const loadMission = async () => {
		if (!Number.isSafeInteger(missionId) || missionId < 1) {
			setMissionState('not_found');
			return;
		}

		setMissionState('loading');
		try {
			const res = await fetch(`/api/admin/games/${missionId}`, { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminGameMissionResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				if (parsed && 'error' in parsed && parsed.error === 'not_found') {
					setMissionState('not_found');
					return;
				}
				setMissionState('error');
				return;
			}

			syncMissionState(parsed.mission);
			setMissionState('ready');
		} catch {
			setMissionState('error');
		}
	};

	// SSE: auto-refresh slotting when it changes externally (e.g. unit leader claims a slot)
	const slottingRevisionRef = useRef(mission?.slottingRevision ?? 0);
	useEffect(() => {
		slottingRevisionRef.current = mission?.slottingRevision ?? 0;
	}, [mission?.slottingRevision]);

	useEffect(() => {
		const shortCode = mission?.shortCode;
		if (!shortCode) return;

		const source = new EventSource(`/api/games/${encodeURIComponent(shortCode)}/events`);

		source.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data as string) as { type: string; slottingRevision?: number };
				if (data.type === 'slotting_updated' && typeof data.slottingRevision === 'number' && data.slottingRevision > slottingRevisionRef.current) {
					void (async () => {
						try {
							const res = await fetch(`/api/admin/games/${missionId}`, { cache: 'no-store' });
							const json: unknown = await res.json();
							const parsed = parseAdminGameMissionResponse(json);
							if (parsed && !('error' in parsed)) {
								syncSlottingResponse(parsed.mission);
							}
						} catch {
							// Silently ignore — next SSE event will retry
						}
					})();
				}
			} catch {
				// Ignore parse errors
			}
		};

		return () => source.close();
	}, [mission?.shortCode]); // eslint-disable-line react-hooks/exhaustive-deps

	const loadAudit = async () => {
		if (!Number.isSafeInteger(missionId) || missionId < 1) return;
		setAuditState('loading');
		try {
			const res = await fetch(`/api/admin/games/${missionId}/audit`, { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminGameAuditResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setAuditState('error');
				return;
			}

			setAuditEvents(parsed.events);
			setAuditState('ready');
		} catch {
			setAuditState('error');
		}
	};

	const loadBadgeCatalog = async () => {
		setBadgeCatalogState('loading');
		try {
			const res = await fetch('/api/admin/badges', { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseAdminBadgesResponse(json);
			if (!res.ok || !parsed || 'error' in parsed) {
				setBadgeCatalogState('error');
				return;
			}

			setBadgeCatalog(parsed.badges);
			setBadgeCatalogState('ready');
		} catch {
			setBadgeCatalogState('error');
		}
	};

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		void loadMission();
		void loadAudit();
		void loadBadgeCatalog();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status, missionId]);

	const applyMissionResponse = async (
		response: Response,
		json: unknown,
		actionLabel: string,
		onError?: (error: AdminGamesErrorView) => Promise<boolean> | boolean
	) => {
		const parsed = parseAdminGameMissionResponse(json);
		if (!response.ok || !parsed || 'error' in parsed) {
			const errorPayload: AdminGamesErrorView = parsed && 'error' in parsed ? parsed : { error: 'server_error' };
			if (onError) {
				const handled = await onError(errorPayload);
				if (handled) return true;
			}
			setFeedback({
				tone: 'error',
				message: `${ta('gamesActionFailedPrefix')} ${actionLabel}: ${formatErrorCode(errorPayload.error)}`
			});
			return false;
		}

		syncMissionState(parsed.mission);
		setFeedback({ tone: 'success', message: `${ta('gamesActionSucceededPrefix')} ${actionLabel}.` });
		await loadAudit();
		return true;
	};

	const applyLifecycleResponse = async (
		response: Response,
		json: unknown,
		actionLabel: string,
		onError?: (error: AdminGamesErrorView) => Promise<boolean> | boolean
	) => {
		const parsed = parseAdminGameMissionResponse(json);
		if (!response.ok || !parsed || 'error' in parsed) {
			const errorPayload: AdminGamesErrorView = parsed && 'error' in parsed ? parsed : { error: 'server_error' };
			if (onError) {
				const handled = await onError(errorPayload);
				if (handled) return true;
			}
			setFeedback({
				tone: 'error',
				message: `${ta('gamesActionFailedPrefix')} ${actionLabel}: ${formatErrorCode(errorPayload.error)}`
			});
			return false;
		}

		syncMissionLifecycle(parsed.mission);
		setFeedback({ tone: 'success', message: `${ta('gamesActionSucceededPrefix')} ${actionLabel}.` });
		await loadAudit();
		return true;
	};

	const applySlottingResponse = async (
		response: Response,
		json: unknown,
		actionLabel: string,
		onError?: (error: AdminGamesErrorView) => Promise<boolean> | boolean
	) => {
		const parsed = parseAdminGameMissionResponse(json);
		if (!response.ok || !parsed || 'error' in parsed) {
			const errorPayload: AdminGamesErrorView = parsed && 'error' in parsed ? parsed : { error: 'server_error' };
			if (onError) {
				const handled = await onError(errorPayload);
				if (handled) return true;
			}
			setFeedback({
				tone: 'error',
				message: `${ta('gamesActionFailedPrefix')} ${actionLabel}: ${formatErrorCode(errorPayload.error)}`
			});
			return false;
		}

		syncSlottingResponse(parsed.mission);
		setFeedback({ tone: 'success', message: `${ta('gamesActionSucceededPrefix')} ${actionLabel}.` });
		await loadAudit();
		return true;
	};

	const handleSaveSettings = async () => {
		if (!mission || !settingsForm) return;
		const startsAt = fromLocalInputValue(settingsForm.startsAt);
		if (settingsForm.startsAt.trim() && !startsAt) {
			setFeedback({
				tone: 'error',
				message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSettingsAction')}: ${ta('gamesFieldStartsAt')}: invalid date/time`
			});
			return;
		}

		const priorityClaimOpensAt = fromLocalInputValue(settingsForm.priorityClaimOpensAt);
		if (settingsForm.priorityClaimOpensAt.trim() && !priorityClaimOpensAt) {
			setFeedback({
				tone: 'error',
				message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSettingsAction')}: ${ta('gamesFieldPriorityOpensAt')}: invalid date/time`
			});
			return;
		}

		const serverPortText = settingsForm.serverPort.trim();
		let serverPort: number | null = null;
		if (serverPortText) {
			const parsedServerPort = Number(serverPortText);
			if (
				!/^\d+$/.test(serverPortText) ||
				!Number.isSafeInteger(parsedServerPort) ||
				parsedServerPort < 1 ||
				parsedServerPort > 65535
			) {
				setFeedback({
					tone: 'error',
					message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSettingsAction')}: ${ta('gamesFieldServerPort')}: must be between 1 and 65535`
				});
				return;
			}
			serverPort = parsedServerPort;
		}

		try {
			setFeedback(null);
			setActiveAction('settings');
			const earlyPassword = settingsForm.earlyPassword.trim();
			const finalPassword = settingsForm.finalPassword.trim();
			const res = await fetch(`/api/admin/games/${mission.id}/settings`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					settingsRevision: mission.settingsRevision,
					title: settingsForm.title.trim(),
					description: {
						en: settingsForm.descriptionEn,
						ru: settingsForm.descriptionRu,
						uk: settingsForm.descriptionUk,
						ar: settingsForm.descriptionAr
					},
					shortCode: settingsForm.shortCode.trim() || null,
					startsAt,
					serverName: settingsForm.serverName.trim(),
					serverHost: settingsForm.serverHost.trim(),
					serverPort,
					earlyPassword: earlyPassword.length > 0 ? earlyPassword : null,
					finalPassword: finalPassword.length > 0 ? finalPassword : null,
					priorityClaimOpensAt,
					priorityClaimManualState: settingsForm.priorityClaimManualState,
					unitSlottingManualState: settingsForm.unitSlottingManualState,
					regularJoinEnabled: settingsForm.regularJoinEnabled,
					serverDetailsHidden: settingsForm.serverDetailsHidden,
					priorityBadgeTypeIds: settingsForm.priorityBadgeTypeIds,
					skipPriorityDiscord: settingsForm.skipPriorityDiscord
				})
			});
			const json: unknown = (await res.json()) as unknown;
			await applyMissionResponse(res, json, ta('gamesSaveSettingsAction'), (errorPayload) => {
				if (errorPayload.error !== 'validation_error' || !errorPayload.details?.length) {
					return false;
				}

				setFeedback({
					tone: 'error',
					message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSettingsAction')}: ${formatSettingsValidationDetails(errorPayload.details, ta)}`
				});
				return true;
			});
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSettingsAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handleSaveSlotting = async (confirmDestructive = false) => {
		if (!mission) return;
		let parsedSlotting: unknown;
		try {
			parsedSlotting = JSON.parse(slottingText);
		} catch {
			setFeedback({ tone: 'error', message: ta('gamesSlottingJsonInvalid') });
			return;
		}

		try {
			setFeedback(null);
			setActiveAction('slotting');
			const episodeData = mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
			const revision = episodeData?.slottingRevision ?? mission.slottingRevision;
			const res = await fetch(`/api/admin/games/${mission.id}/slotting`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					episodeNumber: selectedSlottingEpisode,
					slottingRevision: revision,
					slotting: parsedSlotting,
					confirmDestructive
				})
			});
			const json: unknown = (await res.json()) as unknown;
			await applySlottingResponse(res, json, ta('gamesSaveSlottingAction'), async (errorPayload) => {
				if (errorPayload.error !== 'destructive_change_requires_confirmation' || !errorPayload.destructiveChanges?.length) {
					return false;
				}

				const details = errorPayload.destructiveChanges.slice(0, 5).map(formatDestructiveChange).join('\n');
				setPendingDestructiveChanges({
					details,
					onConfirm: () => {
						setPendingDestructiveChanges(null);
						void handleSaveSlotting(true);
					}
				});
				return true;
			});
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesSaveSlottingAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handlePublish = () => {
		if (!mission) return;
		const skip = skipPublishDiscord;
		setConfirmAction({
			title: skip ? ta('gamesConfirmPublishTitle') : ta('gamesConfirmPublishDiscordTitle'),
			description: skip ? ta('gamesConfirmPublishText') : ta('gamesConfirmPublishDiscordText'),
			confirmLabel: ta('gamesPublishAction'),
			onConfirm: () => {
				setConfirmAction(null);
				void (async () => {
					try {
						setFeedback(null);
						setActiveAction('publish');
						const res = await fetch(`/api/admin/games/${mission.id}/publish`, {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ settingsRevision: mission.settingsRevision, skipDiscord: skip })
						});
						const json = (await res.json()) as AdminGamesErrorView & { reasons?: GamePublishValidationError[] };
						await applyLifecycleResponse(res, json, ta('gamesPublishAction'), (errorPayload) => {
							if (errorPayload.error !== 'publish_validation_failed' || !errorPayload.reasons?.length) {
								return false;
							}
							setFeedback({
								tone: 'error',
								message: `${ta('gamesPublishBlockedPrefix')} ${errorPayload.reasons.map(formatPublishReason).join(', ')}`
							});
							return true;
						});
					} catch {
						setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesPublishAction')}: server error` });
					} finally {
						setActiveAction(null);
					}
				})();
			}
		});
	};

	const handleSimpleMissionAction = async (url: string, actionKey: string) => {
		try {
			setFeedback(null);
			setActiveAction(actionKey);
			const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
			const json: unknown = (await res.json()) as unknown;
			await applyLifecycleResponse(res, json, ta(actionKey));
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta(actionKey)}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handleEditMissionUpdate = (update: AdminGameMissionDetail['updates'][number]) => {
		setEditingMissionUpdateId(update.id);
		setMissionUpdateEpisodeNumber(update.episodeNumber ? String(update.episodeNumber) : '');
		setMissionUpdateTotalEpisodes(update.totalEpisodes ? String(update.totalEpisodes) : '3');
	};

	const cancelMissionUpdateEditing = () => {
		setEditingMissionUpdateId(null);
		setMissionUpdateEpisodeNumber('');
		setMissionUpdateTotalEpisodes('3');
	};

	const handleCreateMissionUpdate = async (kind: 'units_slotting_started' | 'priority_slotting_started' | 'regular_slotting_started' | 'game_started_wait_next_episode') => {
		if (!mission) return;

		if (!/^\d+$/.test(missionUpdateEpisodeNumber.trim())) {
			setFeedback({ tone: 'error', message: ta('gamesMissionUpdatesEpisodeRequired') });
			return;
		}

		if (!/^\d+$/.test(missionUpdateTotalEpisodes.trim())) {
			setFeedback({ tone: 'error', message: ta('gamesMissionUpdatesTotalEpisodesInvalid') });
			return;
		}

		const episodeNumber = Number.parseInt(missionUpdateEpisodeNumber, 10);
		const totalEpisodes = Number.parseInt(missionUpdateTotalEpisodes, 10);

		if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
			setFeedback({ tone: 'error', message: ta('gamesMissionUpdatesEpisodeRequired') });
			return;
		}

		if (!Number.isInteger(totalEpisodes) || totalEpisodes < episodeNumber) {
			setFeedback({ tone: 'error', message: ta('gamesMissionUpdatesTotalEpisodesInvalid') });
			return;
		}

		try {
			setFeedback(null);
			setActiveAction('mission-update');
			const isEditing = editingMissionUpdateId !== null;
			const res = await fetch(
				isEditing
					? `/api/admin/games/${mission.id}/updates/${editingMissionUpdateId}`
					: `/api/admin/games/${mission.id}/updates`,
				{
				method: isEditing ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					kind,
					episodeNumber,
					totalEpisodes
				})
			});
			const json: unknown = (await res.json()) as unknown;
			const ok = await applyLifecycleResponse(res, json, isEditing ? ta('gamesMissionUpdatesSaveAction') : ta('gamesMissionUpdatesPostAction'));
			if (ok) {
				cancelMissionUpdateEditing();
			}
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${editingMissionUpdateId !== null ? ta('gamesMissionUpdatesSaveAction') : ta('gamesMissionUpdatesPostAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handleArchive = async () => {
		if (!mission) return;
		const allSides = collectAllSides(mission);
		const sideScoreList = allSides.map((side) => {
			const raw = sideScores[side.id]?.trim();
			return {
				sideId: side.id,
				score: raw ? Number(raw) : 0
			};
		});
		if (sideScoreList.some((entry) => !Number.isInteger(entry.score) || entry.score < 0)) {
			setFeedback({ tone: 'error', message: ta('gamesArchiveScoresInvalid') });
			return;
		}

		try {
			setFeedback(null);
			setActiveAction('archive');
			const res = await fetch(`/api/admin/games/${mission.id}/archive`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					result: {
						winnerSideId: winnerSideId || null,
						sideScores: sideScoreList
					}
				})
			});
			const json: unknown = (await res.json()) as unknown;
			const ok = await applyLifecycleResponse(res, json, ta('gamesArchiveAction'));
			if (ok) {
			}
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesArchiveAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handleCancel = async () => {
		if (!mission) return;
		if (!cancelReason.trim()) {
			setFeedback({ tone: 'error', message: ta('gamesCancelReasonRequiredMessage') });
			return;
		}

		try {
			setFeedback(null);
			setActiveAction('cancel');
			const res = await fetch(`/api/admin/games/${mission.id}/cancel`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: cancelReason.trim() })
			});
			const json: unknown = (await res.json()) as unknown;
			const ok = await applyLifecycleResponse(res, json, ta('gamesCancelAction'));
			if (ok) {
			}
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesCancelAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const handleDeleteArchived = async () => {
		if (!mission) return;
		try {
			setFeedback(null);
			setActiveAction('deleteArchived');
			const res = await fetch(`/api/admin/games/${mission.id}`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ titleConfirmation })
			});
			const json: unknown = (await res.json()) as unknown;
			if (!res.ok) {
				const parsed = parseAdminGameMissionResponse(json);
				const errorPayload: AdminGamesErrorView = parsed && 'error' in parsed ? parsed : { error: 'server_error' };
				setFeedback({
					tone: 'error',
					message: `${ta('gamesActionFailedPrefix')} ${ta('gamesDeleteArchivedAction')}: ${formatErrorCode(errorPayload.error)}`
				});
				return;
			}

			router.push('/admin/games');
			router.refresh();
		} catch {
			setFeedback({ tone: 'error', message: `${ta('gamesActionFailedPrefix')} ${ta('gamesDeleteArchivedAction')}: server error` });
		} finally {
			setActiveAction(null);
		}
	};

	const visibleBadgeCatalog = badgeCatalog.filter(
		(badge) => badge.status === 'active' || (settingsForm?.priorityBadgeTypeIds ?? []).includes(badge.id)
	);

	const togglePriorityBadgeType = (badgeTypeId: number) => {
		setSettingsForm((current) => {
			if (!current) return current;
			const hasBadge = current.priorityBadgeTypeIds.includes(badgeTypeId);
			return {
				...current,
				priorityBadgeTypeIds: hasBadge
					? current.priorityBadgeTypeIds.filter((id) => id !== badgeTypeId)
					: [...current.priorityBadgeTypeIds, badgeTypeId]
			};
		});
	};

	if (missionState === 'loading' || status === null) {
		return (
			<AdminSurface>
				<AdminGate status={status} redirectPath={redirectPath} t={ta}>
					<p className="text-sm text-neutral-300">{ta('loading')}</p>
				</AdminGate>
			</AdminSurface>
		);
	}

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					{missionState === 'not_found' ? (
						<div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/30 p-5">
							<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{ta('gamesMissionNotFoundTitle')}</h2>
							<p className="mt-2 text-sm text-neutral-400">{ta('gamesMissionNotFoundText')}</p>
						</div>
					) : missionState === 'error' || !mission || !settingsForm ? (
						<p className="text-sm text-neutral-300">{ta('gamesMissionLoadError')}</p>
					) : (
						<>
							<AdminToolbar
								title={mission.title.trim() || ta('gamesUntitledMission')}
								countText={`#${mission.id}`}
								actions={
									mission.shortCode && mission.status !== 'draft' ? (
										<Link href={`/games/${mission.shortCode}`} className="text-sm font-semibold text-[color:var(--accent)] hover:opacity-80">
											{ta('gamesOpenPublishedMission')}
										</Link>
									) : undefined
								}
							/>

							<div className="flex flex-wrap items-center gap-2">
								{renderStateBadge(
									formatMissionStatusLabel(mission, ta),
									mission.status === 'published' ? 'success' : mission.status === 'archived' ? 'danger' : 'neutral'
								)}
							</div>

							{feedback ? (
								<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>
									{feedback.message}
								</p>
							) : null}

										<section className={editorSectionClass}>
										<div className="grid gap-4">
											<div>
												<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('gamesSettingsSectionTitle')}</h2>
												<p className="mt-1 text-sm text-neutral-400">{ta('gamesSettingsSectionText')}</p>
											</div>

												<div className={`${editorCardClass} grid gap-4`}>
													<Field label={ta('gamesFieldTitle')}>
														<input value={settingsForm.title} onChange={(event) => setSettingsForm({ ...settingsForm, title: event.target.value })} className={editorInputClass} />
													</Field>
													<Field label={ta('gamesFieldShortCode')}>
														<input value={settingsForm.shortCode} onChange={(event) => setSettingsForm({ ...settingsForm, shortCode: event.target.value })} className={editorInputClass} />
													</Field>
													<Field label={ta('gamesFieldDescriptionEn')}>
														<textarea value={settingsForm.descriptionEn} onChange={(event) => setSettingsForm({ ...settingsForm, descriptionEn: event.target.value })} rows={4} className={editorTextAreaClass} />
													</Field>
													<Field label={ta('gamesFieldDescriptionRu')}>
														<textarea value={settingsForm.descriptionRu} onChange={(event) => setSettingsForm({ ...settingsForm, descriptionRu: event.target.value })} rows={4} className={editorTextAreaClass} />
													</Field>
													<Field label={ta('gamesFieldDescriptionUk')}>
														<textarea value={settingsForm.descriptionUk} onChange={(event) => setSettingsForm({ ...settingsForm, descriptionUk: event.target.value })} rows={4} className={editorTextAreaClass} />
													</Field>
													<Field label={ta('gamesFieldDescriptionAr')}>
														<textarea value={settingsForm.descriptionAr} onChange={(event) => setSettingsForm({ ...settingsForm, descriptionAr: event.target.value })} rows={4} className={editorTextAreaClass} />
													</Field>
												</div>

												<div className={`${editorCardClass} grid gap-4`}>
													<Field label={ta('gamesFieldStartsAt')}>
														<input type="datetime-local" value={settingsForm.startsAt} onChange={(event) => setSettingsForm({ ...settingsForm, startsAt: event.target.value })} className={editorDateTimeClass} />
														<AdminButton variant="secondary" className="mt-1 w-fit text-xs" onClick={() => setSettingsForm({ ...settingsForm, startsAt: getNextSunday1445Utc() })}>
															{ta("gamesNextSundayQuickPick")}
														</AdminButton>
													</Field>
													<Field label={ta('gamesFieldServerName')}>
														<input value={settingsForm.serverName} onChange={(event) => setSettingsForm({ ...settingsForm, serverName: event.target.value })} className={editorInputClass} />
													</Field>
													<Field label={ta('gamesFieldServerHost')}>
														<input value={settingsForm.serverHost} onChange={(event) => setSettingsForm({ ...settingsForm, serverHost: event.target.value })} className={editorInputClass} />
													</Field>
													<Field label={ta('gamesFieldServerPort')}>
														<input type="number" min={1} max={65535} inputMode="numeric" value={settingsForm.serverPort} onChange={(event) => setSettingsForm({ ...settingsForm, serverPort: event.target.value })} className={editorInputClass} />
													</Field>
													<label className="flex items-center gap-3 text-sm text-neutral-200">
														<input type="checkbox" checked={settingsForm.serverDetailsHidden} onChange={(event) => setSettingsForm({ ...settingsForm, serverDetailsHidden: event.target.checked })} className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)] focus:ring-[color:var(--accent)]" />
														<span>{ta('gamesFieldServerDetailsHidden')}</span>
													</label>
													<Field label={ta('gamesFieldEarlyPassword')}>
														<input value={settingsForm.earlyPassword} onChange={(event) => setSettingsForm({ ...settingsForm, earlyPassword: event.target.value })} className={editorInputClass} />
													</Field>
													<Field label={ta('gamesFieldFinalPassword')}>
														<input value={settingsForm.finalPassword} onChange={(event) => setSettingsForm({ ...settingsForm, finalPassword: event.target.value })} className={editorInputClass} />
													</Field>
												</div>

												<div className={`${editorCardClass} grid gap-4`}>
													<div>
														<p className="text-sm font-semibold text-neutral-200">{ta('slottingPhasesTitle')}</p>
														<p className="mt-1 text-xs text-neutral-500">{ta('slottingPhasesDescription')}</p>
													</div>

													<div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
														<div className="flex flex-wrap items-center justify-between gap-3">
															<div>
																<p className="text-xs font-semibold text-emerald-300">{ta('slottingPhaseUnitTitle')}</p>
																<p className="mt-0.5 text-[11px] text-emerald-200/60">{ta('slottingPhaseUnitDescription')}</p>
															</div>
															<select value={settingsForm.unitSlottingManualState} onChange={(event) => setSettingsForm({ ...settingsForm, unitSlottingManualState: event.target.value as SettingsFormState['unitSlottingManualState'] })} className={`w-28 ${editorInputClass}`}>
																<option value="open">{ta('slottingPhaseOpen')}</option>
																<option value="closed">{ta('slottingPhaseClosed')}</option>
															</select>
														</div>
													</div>

													<div className="rounded-xl border border-[color:var(--accent)]/15 bg-[color:var(--accent)]/5 p-3">
														<div className="flex flex-wrap items-center justify-between gap-3">
															<div>
																<p className="text-xs font-semibold text-[color:var(--accent)]">{ta('slottingPhasePriorityTitle')}</p>
																<p className="mt-0.5 text-[11px] text-neutral-400">{ta('slottingPhasePriorityDescription')}</p>
															</div>
															<select value={settingsForm.priorityClaimManualState} onChange={(event) => setSettingsForm({ ...settingsForm, priorityClaimManualState: event.target.value as SettingsFormState['priorityClaimManualState'] })} className={`w-28 ${editorInputClass}`}>
																<option value="default">{ta('slottingPhasePriorityScheduled')}</option>
																<option value="open">{ta('slottingPhasePriorityForceOpen')}</option>
																<option value="closed">{ta('slottingPhasePriorityForceClosed')}</option>
															</select>
														</div>
														<div className="mt-3 grid gap-2">
															<label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{ta('slottingPhasePriorityOpensAt')}</label>
															<input type="datetime-local" value={settingsForm.priorityClaimOpensAt} onChange={(event) => setSettingsForm({ ...settingsForm, priorityClaimOpensAt: event.target.value })} className={editorDateTimeClass} />
															<AdminButton variant="secondary" className="w-fit text-xs" onClick={() => { const v = startsAtMinus24h(settingsForm.startsAt); if (v) setSettingsForm({ ...settingsForm, priorityClaimOpensAt: v }); }} disabled={!settingsForm.startsAt}>
																{ta('gamesPriorityMinus24hQuickPick')}
															</AdminButton>
														</div>
														<label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
															<input type="checkbox" checked={settingsForm.skipPriorityDiscord} onChange={(e) => setSettingsForm({ ...settingsForm, skipPriorityDiscord: e.target.checked })} disabled={activeAction !== null} className="accent-[color:var(--accent)]" />
															{ta('gamesPrioritySlottingSkipDiscord')}
														</label>
													</div>

													<div className="rounded-xl border border-neutral-800 bg-white/[0.02] p-3">
														<div className="flex flex-wrap items-center justify-between gap-3">
															<div>
																<p className="text-xs font-semibold text-neutral-300">{ta('slottingPhaseRegularTitle')}</p>
																<p className="mt-0.5 text-[11px] text-neutral-500">{ta('slottingPhaseRegularDescription')}</p>
															</div>
															<select value={settingsForm.regularJoinEnabled ? 'open' : 'closed'} onChange={(event) => setSettingsForm({ ...settingsForm, regularJoinEnabled: event.target.value === 'open' })} className={`w-28 ${editorInputClass}`}>
																<option value="open">{ta('slottingPhaseOpen')}</option>
																<option value="closed">{ta('slottingPhaseClosed')}</option>
															</select>
														</div>
													</div>

													<p className="text-[11px] text-neutral-500">{ta('slottingPhasesNote')}</p>
												</div>

												<div className={`${editorCardClass} grid gap-3`}>
													<Field label={ta('gamesFieldPriorityBadgeIds')}>
														{badgeCatalogState === 'loading' ? (
															<p className="mt-2 text-sm text-neutral-400">{ta('gamesBadgeCatalogLoading')}</p>
														) : badgeCatalogState === 'error' ? (
															<p className="mt-2 text-sm text-neutral-400">{ta('gamesBadgeCatalogError')}</p>
														) : visibleBadgeCatalog.length === 0 ? (
															<p className="mt-2 text-sm text-neutral-400">{ta('gamesBadgeCatalogEmpty')}</p>
														) : (
															<div className="mt-2 grid gap-2 sm:grid-cols-2">
																{visibleBadgeCatalog.map((badge) => {
																	const isSelected = settingsForm.priorityBadgeTypeIds.includes(badge.id);
																	const isLockedRetired = badge.status === 'retired' && !isSelected;
																	return (
																		<label
																			key={badge.id}
																			className={
																				'flex items-start gap-3 rounded-2xl border p-4 text-sm transition-colors ' +
																				(isSelected
																					? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-neutral-50'
																					: 'border-neutral-800 bg-neutral-950/60 text-neutral-300') +
																				(isLockedRetired ? ' opacity-60' : '')
																			}
																		>
																			<input
																				type="checkbox"
																				checked={isSelected}
																				disabled={isLockedRetired || activeAction !== null}
																				onChange={() => togglePriorityBadgeType(badge.id)}
																				className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
																			/>
																			<div className="grid gap-2">
																				<div className="flex flex-wrap items-center gap-2">
																					<span className="font-semibold text-neutral-50">{badge.label}</span>
																					{badge.status === 'retired' ? renderStateBadge(ta('badgesStatusRetired'), 'danger') : null}
																				</div>
																				<div className="flex flex-wrap gap-3 text-xs text-neutral-400">
																					<span>{ta('badgesUserCount', { count: badge.user_count })}</span>
																					<span>{ta('badgesMissionCount', { count: badge.mission_count })}</span>
																				</div>
																			</div>
																		</label>
																	);
																})}
															</div>
														)}
													</Field>
													<p className="text-xs text-neutral-500">
														{ta('gamesFieldPriorityBadgeIdsHelp')}{' '}
														<Link href="/admin/badges" className="font-semibold text-[color:var(--accent)] hover:opacity-80">
															{ta('gamesManageBadgesLink')}
														</Link>
													</p>
												</div>

												<div className={editorCardClass}>
													<ImageUploadArea mission={mission} ta={ta} setFeedback={setFeedback} onImageChanged={setMission} />
												</div>

												<AdminButton variant="primary" onClick={() => void handleSaveSettings()} disabled={activeAction !== null}>
													{activeAction === 'settings' ? ta('gamesSavingSettings') : ta('gamesSaveSettingsAction')}
												</AdminButton>
											</div>
										</section>

										<section className={editorSectionClass}>
										<div className="grid gap-4">
											<div>
												<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('gamesSlottingSectionTitle')}</h2>
												<p className="mt-1 text-sm text-neutral-400">{ta('gamesSlottingSectionText')}</p>
											</div>

											<EpisodeSelector
												mission={mission}
												selectedEpisode={selectedSlottingEpisode}
												onSelectedEpisodeChange={(ep) => {
													setSelectedSlottingEpisode(ep);
													const epData = mission.episodeSlottings?.find((e) => e.episodeNumber === ep);
													setSlottingText(JSON.stringify(epData?.slotting ?? mission.slotting, null, 2));
												}}
												onSaved={syncSlottingResponse}
											/>

											<AdminDisclosure
												summaryLeft={
													<h2 className="text-sm font-semibold tracking-tight text-neutral-200">{ta('gamesFieldSlottingJson')}</h2>
												}
											>
												<div className="grid gap-3">
													<textarea value={slottingText} onChange={(event) => setSlottingText(event.target.value)} rows={20} spellCheck={false} className={editorMonoTextAreaClass} />
													{(() => {
														try {
															const parsed = JSON.parse(slottingText) as { sides?: Array<{ squads?: Array<{ slots?: Array<{ access?: string }> }> }> };
															const hasNonUnit = parsed?.sides?.some(s => s.squads?.some(sq => sq.slots?.some(sl => sl.access !== 'unit')));
															if (hasNonUnit) {
																return (
																	<p className="text-xs text-amber-300">
																		Some slots have non-unit access. Before priority opens, all slots should typically be set to &quot;unit&quot; access. The system will auto-assign priority and regular slots when the priority phase opens.
																	</p>
																);
															}
														} catch { /* invalid JSON, ignore */ }
														return null;
													})()}
													<AdminButton variant="primary" onClick={() => void handleSaveSlotting()} disabled={activeAction !== null}>
														{activeAction === 'slotting' ? ta('gamesSavingSlotting') : ta('gamesSaveSlottingAction')}
													</AdminButton>
												</div>
											</AdminDisclosure>

											<AdminDisclosure
												summaryLeft={
													<h2 className="text-sm font-semibold tracking-tight text-neutral-200">{tg('adminUnitAssignmentsTitle')}</h2>
												}
											>
												<UnitAssignmentsPanel missionId={mission.id} episodeNumber={selectedSlottingEpisode} slotting={(() => {
												const ep = mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
												return ep?.slotting ?? mission.slotting;
											})()} currentAssignments={mission.unitAssignments} onSaved={syncSlottingResponse}
											onApplyCommanders={async (sideATag, sideBTag, sideAMissionSideId, sideBMissionSideId) => {
												try {
													const episodeData = mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
													const currentSlotting = episodeData?.slotting ?? mission.slotting;
													const revision = episodeData?.slottingRevision ?? mission.slottingRevision;
													const modified = JSON.parse(JSON.stringify(currentSlotting)) as { sides: Array<{ id: string; squads: Array<{ slots: Array<{ occupant: unknown }> }> }> };
													for (const side of modified.sides) {
														let tag: string | null = null;
														if (side.id === sideAMissionSideId) tag = sideATag;
														else if (side.id === sideBMissionSideId) tag = sideBTag;
														if (!tag) continue;
														const firstSlot = side.squads?.[0]?.slots?.[0];
														if (firstSlot) {
															firstSlot.occupant = { type: 'placeholder', label: tag };
														}
													}
													const res = await fetch(`/api/admin/games/${mission.id}/slotting`, {
														method: 'PUT',
														headers: { 'content-type': 'application/json' },
														body: JSON.stringify({
															episodeNumber: selectedSlottingEpisode,
															slottingRevision: revision,
															slotting: modified,
															confirmDestructive: false,
														})
													});
													const json: unknown = await res.json();
													const parsed = parseAdminGameMissionResponse(json);
													if (parsed && !('error' in parsed)) {
														// Only update slotting state, not the full mission
														// (full mission refresh would reset the unsaved assignment list)
														const ep = parsed.mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
														setSlottingText(JSON.stringify(ep?.slotting ?? parsed.mission.slotting, null, 2));
														setMission((prev) => prev ? {
															...prev,
															slotting: parsed.mission.slotting,
															slottingRevision: parsed.mission.slottingRevision,
															episodeSlottings: parsed.mission.episodeSlottings,
														} : prev);
													}
												} catch {
													// failed to apply commanders to slotting
												}
											}} />
											</AdminDisclosure>

											<AdminDisclosure
												summaryLeft={
													<h2 className="text-sm font-semibold tracking-tight text-neutral-200">{tg('adminSlottingEditorTitle')}</h2>
												}
											>
												<SlottingEditor
													slotting={(() => {
														const ep = mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
														return ep?.slotting ?? mission.slotting;
													})()}
													slottingRevision={(() => {
														const ep = mission.episodeSlottings?.find((e) => e.episodeNumber === selectedSlottingEpisode);
														return ep?.slottingRevision ?? mission.slottingRevision;
													})()}
													unitAssignments={mission.unitAssignments}
													missionId={mission.id}
													episodeNumber={selectedSlottingEpisode}
													onSaved={syncSlottingResponse}
												/>
											</AdminDisclosure>
										</div>
										</section>

										<section className={editorSectionClass}>
										<div className="grid gap-4">
											<div>
												<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('gamesLifecycleSectionTitle')}</h2>
												<p className="mt-1 text-sm text-neutral-400">{ta('gamesLifecycleSectionText')}</p>
											</div>

														<div className="grid gap-4">
													<ActionCard title={ta('gamesPublishCardTitle')} description={ta('gamesPublishCardText')}>
														<div className="flex flex-col gap-3">
															<div>
																<AdminButton variant="primary" onClick={() => handlePublish()} disabled={activeAction !== null || mission.status !== 'draft'}>
																	{activeAction === 'publish' ? ta('gamesPublishing') : ta('gamesPublishAction')}
																</AdminButton>
															</div>
															<label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
																<input
																	type="checkbox"
																	checked={skipPublishDiscord}
																	onChange={(e) => setSkipPublishDiscord(e.target.checked)}
																	className="accent-[color:var(--accent)]"
																	disabled={mission.status !== 'draft'}
																/>
																{ta('gamesPublishSkipDiscord')}
															</label>
														</div>
													</ActionCard>

													{mission.status === 'published' && (
														<ActionCard title={ta('gamesDiscordNotifyCardTitle')} description={ta('gamesDiscordNotifyCardText')}>
															<div className="flex flex-wrap gap-3">
																<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmDiscordNotifyTitle'), description: ta('gamesConfirmDiscordNotifyText'), confirmLabel: ta('gamesDiscordNotifyAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/notify-discord`, 'gamesDiscordNotifyAction'); } })} disabled={activeAction !== null}>
																	{activeAction === 'gamesDiscordNotifyAction' ? ta('gamesDiscordNotifySending') : ta('gamesDiscordNotifyAction')}
																</AdminButton>
																<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmPriorityDiscordNotifyTitle'), description: ta('gamesConfirmPriorityDiscordNotifyText'), confirmLabel: ta('gamesPriorityDiscordNotifyAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/notify-priority-discord`, 'gamesPriorityDiscordNotifyAction'); } })} disabled={activeAction !== null}>
																	{activeAction === 'gamesPriorityDiscordNotifyAction' ? ta('gamesPriorityDiscordNotifySending') : ta('gamesPriorityDiscordNotifyAction')}
																</AdminButton>
															</div>
														</ActionCard>
													)}

													<ActionCard title={ta('gamesReleaseCardTitle')} description={ta('gamesReleaseCardText')}>
														<div className="flex flex-wrap gap-3">
															<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmReleaseUnitTitle'), description: ta('gamesConfirmReleaseUnitText'), confirmLabel: ta('gamesReleaseUnitAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/release-unit`, 'gamesReleaseUnitAction'); } })} disabled={activeAction !== null || mission.status !== 'published' || !!mission.unitGameplayReleasedAt}>
																{activeAction === 'gamesReleaseUnitAction' ? ta('gamesReleasingUnit') : ta('gamesReleaseUnitAction')}
															</AdminButton>
															<AdminButton variant="secondary" onClick={() => void handleSimpleMissionAction(`/api/admin/games/${mission.id}/hide-unit`, 'gamesHideUnitAction')} disabled={activeAction !== null || mission.status !== 'published' || !mission.unitGameplayReleasedAt || !!mission.priorityGameplayReleasedAt}>
																{activeAction === 'gamesHideUnitAction' ? ta('gamesHidingUnit') : ta('gamesHideUnitAction')}
															</AdminButton>
															<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmReleasePriorityTitle'), description: ta('gamesConfirmReleasePriorityText'), confirmLabel: ta('gamesReleasePriorityAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/release-priority`, 'gamesReleasePriorityAction'); } })} disabled={activeAction !== null || mission.status !== 'published' || !!mission.priorityGameplayReleasedAt}>
																{activeAction === 'gamesReleasePriorityAction' ? ta('gamesReleasingPriority') : ta('gamesReleasePriorityAction')}
															</AdminButton>
																<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmHidePriorityTitle'), description: ta('gamesConfirmHidePriorityText'), confirmLabel: ta('gamesHidePriorityAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/hide-priority`, 'gamesHidePriorityAction'); } })} disabled={activeAction !== null || mission.status !== 'published' || !mission.priorityGameplayReleasedAt || !!mission.regularGameplayReleasedAt}>
																	{activeAction === 'gamesHidePriorityAction' ? ta('gamesHidingPriority') : ta('gamesHidePriorityAction')}
																</AdminButton>
															<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmReleaseRegularTitle'), description: ta('gamesConfirmReleaseRegularText'), confirmLabel: ta('gamesReleaseRegularAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/release-regular`, 'gamesReleaseRegularAction'); } })} disabled={activeAction !== null || mission.status !== 'published' || !!mission.regularGameplayReleasedAt}>
																{activeAction === 'gamesReleaseRegularAction' ? ta('gamesReleasingRegular') : ta('gamesReleaseRegularAction')}
															</AdminButton>
																<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmHideRegularTitle'), description: ta('gamesConfirmHideRegularText'), confirmLabel: ta('gamesHideRegularAction'), onConfirm: () => { setConfirmAction(null); void handleSimpleMissionAction(`/api/admin/games/${mission.id}/hide-regular`, 'gamesHideRegularAction'); } })} disabled={activeAction !== null || mission.status !== 'published' || !mission.regularGameplayReleasedAt}>
																	{activeAction === 'gamesHideRegularAction' ? ta('gamesHidingRegular') : ta('gamesHideRegularAction')}
																</AdminButton>
														</div>
													</ActionCard>

													<ActionCard title={ta('gamesMissionUpdatesSectionTitle')} description={ta('gamesMissionUpdatesSectionText')}>
														<div className="grid gap-4">
															<label className="grid gap-2 text-sm text-neutral-200">
																<span>{ta('gamesMissionUpdatesEpisodeNumberLabel')}</span>
																<input
																	type="number"
																	min={1}
																	value={missionUpdateEpisodeNumber}
																	onChange={(event) => setMissionUpdateEpisodeNumber(event.target.value)}
																	placeholder={ta('gamesMissionUpdatesEpisodeNumberPlaceholder')}
																	className={editorInputClass}
																/>
															</label>
															<label className="grid gap-2 text-sm text-neutral-200">
																<span>{ta('gamesMissionUpdatesTotalEpisodesLabel')}</span>
																<input
																	type="number"
																	min={1}
																	value={missionUpdateTotalEpisodes}
																	onChange={(event) => setMissionUpdateTotalEpisodes(event.target.value)}
																	placeholder={ta('gamesMissionUpdatesTotalEpisodesPlaceholder')}
																	className={editorInputClass}
																/>
															</label>
															<p className="text-xs text-neutral-500">{ta('gamesMissionUpdatesEpisodeHelp')}</p>
															<p className="text-xs text-neutral-500">{ta('gamesMissionUpdatesTotalEpisodesHelp')}</p>
															{editingMissionUpdateId !== null ? (
																<div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-2 text-sm text-neutral-100">
																	<span>{ta('gamesMissionUpdatesEditingState')}</span>
																	<AdminButton variant="secondary" onClick={cancelMissionUpdateEditing} disabled={activeAction !== null}>
																		{ta('gamesMissionUpdatesCancelEditAction')}
																	</AdminButton>
																</div>
															) : null}

															<div className="flex flex-wrap gap-3">
																<AdminButton variant="secondary" onClick={() => void handleCreateMissionUpdate('units_slotting_started')} disabled={activeAction !== null || mission.status !== 'published' || !missionUpdateEpisodeNumber.trim() || !missionUpdateTotalEpisodes.trim()}>
																	{activeAction === 'mission-update' ? ta(editingMissionUpdateId !== null ? 'gamesMissionUpdatesSaving' : 'gamesMissionUpdatesPosting') : editingMissionUpdateId !== null ? ta('gamesMissionUpdatesSaveUnitsAction') : ta('gamesMissionUpdatesUnitsAction')}
																</AdminButton>
																<AdminButton variant="secondary" onClick={() => void handleCreateMissionUpdate('priority_slotting_started')} disabled={activeAction !== null || mission.status !== 'published' || !missionUpdateEpisodeNumber.trim() || !missionUpdateTotalEpisodes.trim()}>
																	{activeAction === 'mission-update' ? ta(editingMissionUpdateId !== null ? 'gamesMissionUpdatesSaving' : 'gamesMissionUpdatesPosting') : editingMissionUpdateId !== null ? ta('gamesMissionUpdatesSavePriorityAction') : ta('gamesMissionUpdatesPriorityAction')}
																</AdminButton>
																<AdminButton variant="secondary" onClick={() => void handleCreateMissionUpdate('regular_slotting_started')} disabled={activeAction !== null || mission.status !== 'published' || !missionUpdateEpisodeNumber.trim() || !missionUpdateTotalEpisodes.trim()}>
																	{activeAction === 'mission-update' ? ta(editingMissionUpdateId !== null ? 'gamesMissionUpdatesSaving' : 'gamesMissionUpdatesPosting') : editingMissionUpdateId !== null ? ta('gamesMissionUpdatesSaveRegularAction') : ta('gamesMissionUpdatesRegularAction')}
																</AdminButton>
																<AdminButton variant="secondary" onClick={() => void handleCreateMissionUpdate('game_started_wait_next_episode')} disabled={activeAction !== null || mission.status !== 'published' || !missionUpdateEpisodeNumber.trim() || !missionUpdateTotalEpisodes.trim()}>
																	{activeAction === 'mission-update' ? ta(editingMissionUpdateId !== null ? 'gamesMissionUpdatesSaving' : 'gamesMissionUpdatesPosting') : editingMissionUpdateId !== null ? ta('gamesMissionUpdatesSaveGameStartedAction') : ta('gamesMissionUpdatesGameStartedAction')}
																</AdminButton>
															</div>

															{mission.updates.length > 0 ? (
																<div className="max-h-80 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
																	<div className="grid gap-3">
																		{mission.updates.map((update) => (
																			<div key={update.id} className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-3">
																				<div className="flex items-start justify-between gap-3">
																					<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{formatLocalizedDateTime(update.createdAt, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? update.createdAt}</p>
																					<AdminButton variant="secondary" onClick={() => handleEditMissionUpdate(update)} disabled={activeAction !== null || mission.status !== 'published'}>
																						{ta('gamesMissionUpdatesEditAction')}
																					</AdminButton>
																				</div>
																				<p className="mt-2 text-sm leading-7 text-neutral-200">{formatMissionUpdateMessage(update, tg)}</p>
																			</div>
																		))}
																	</div>
																</div>
															) : (
																<p className="text-sm text-neutral-400">{ta('gamesMissionUpdatesEmpty')}</p>
															)}
														</div>
													</ActionCard>

													<ActionCard title={ta('gamesArchiveCardTitle')} description={ta('gamesArchiveCardText')}>
														<div className="grid gap-3">
															{(() => { const allSides = collectAllSides(mission); return (<>
															<label className="grid gap-2 text-sm text-neutral-200">
																<span>{ta('gamesArchiveWinnerLabel')}</span>
																<select value={winnerSideId} onChange={(event) => setWinnerSideId(event.target.value)} className={editorInputClass}>
																	<option value="">{ta('gamesArchiveDrawOption')}</option>
																	{allSides.map((side) => (
																		<option key={side.id} value={side.id}>{sideDisplayName(side)}</option>
																	))}
																</select>
															</label>
															<div className="grid gap-3 sm:grid-cols-2">
																{allSides.map((side) => (
																	<label key={side.id} className="grid gap-2 text-sm text-neutral-200">
																		<span>{ta('gamesArchiveSideScoreLabel', { side: sideDisplayName(side) })}</span>
																		<input value={sideScores[side.id] ?? ''} onChange={(event) => setSideScores({ ...sideScores, [side.id]: event.target.value })} className={editorInputClass} />
																	</label>
																))}
															</div>
															<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmArchiveTitle'), description: ta('gamesConfirmArchiveText'), confirmLabel: ta('gamesArchiveAction'), onConfirm: () => { setConfirmAction(null); void handleArchive(); } })} disabled={activeAction !== null || mission.status !== 'published'}>
																{activeAction === 'archive' ? ta('gamesArchiving') : ta('gamesArchiveAction')}
															</AdminButton>
															</>); })()}
														</div>
													</ActionCard>

													<ActionCard title={ta('gamesCancelCardTitle')} description={ta('gamesCancelCardText')}>
														<div className="grid gap-3">
															<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={4} className={editorTextAreaClass} />
															<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmCancelTitle'), description: ta('gamesConfirmCancelText'), confirmLabel: ta('gamesCancelAction'), onConfirm: () => { setConfirmAction(null); void handleCancel(); } })} disabled={activeAction !== null || mission.status !== 'published'}>
																{activeAction === 'cancel' ? ta('gamesCanceling') : ta('gamesCancelAction')}
															</AdminButton>
														</div>
													</ActionCard>

													{mission.status === 'archived' ? (
														<ActionCard title={ta('gamesDeleteArchivedCardTitle')} description={ta('gamesDeleteArchivedCardText')}>
															<div className="grid gap-3">
																<input value={titleConfirmation} onChange={(event) => setTitleConfirmation(event.target.value)} placeholder={mission.title} className={editorInputClass} />
																<AdminButton variant="secondary" onClick={() => setConfirmAction({ title: ta('gamesConfirmDeleteTitle'), description: ta('gamesConfirmDeleteText'), confirmLabel: ta('gamesDeleteArchivedAction'), onConfirm: () => { setConfirmAction(null); void handleDeleteArchived(); } })} disabled={activeAction !== null}>
																	{activeAction === 'deleteArchived' ? ta('gamesDeletingArchived') : ta('gamesDeleteArchivedAction')}
																</AdminButton>
															</div>
														</ActionCard>
													) : null}
												</div>
											</div>
										</section>

										<AdminDisclosure
											summaryLeft={
												<div>
													<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('gamesAuditSectionTitle')}</h2>
													<p className="mt-1 text-sm text-neutral-400">{ta('gamesAuditSectionText')}</p>
												</div>
											}
											summaryRight={
												auditState === 'ready' && auditEvents.length > 0
													? <span className="text-xs text-neutral-500">{auditEvents.length}</span>
													: undefined
											}
										>
											<div className="mt-4 grid gap-3">
												{mission.status === 'archived' ? (
													<p className="text-xs text-neutral-500">Audit events older than 30 days are automatically removed.</p>
												) : null}
												{auditState === 'loading' || auditState === 'idle' ? (
													<p className="text-sm text-neutral-300">{ta('gamesAuditLoading')}</p>
												) : auditState === 'error' ? (
													<p className="text-sm text-neutral-300">{ta('gamesAuditLoadError')}</p>
												) : auditEvents.length === 0 ? (
													<p className="text-sm text-neutral-400">{ta('gamesAuditEmpty')}</p>
												) : (
													<div className="grid gap-3">
														{auditEvents.map((event) => (
															<div key={event.id} className={editorCardClass}>
																<div className="flex flex-wrap items-center justify-between gap-3">
																	<div>
																		<p className="text-sm font-semibold text-neutral-100">{event.eventType}</p>
																		<p className="mt-1 text-xs text-neutral-500">{formatLocalizedDateTime(event.createdAt, { locale, timeZone, hourCycle, dateStyle: 'medium', timeStyle: 'short' }) ?? event.createdAt}</p>
																	</div>
																	<div className="text-xs text-neutral-400">
																		{event.actorCallsign ?? event.actorSteamId64 ?? ta('gamesUnknownActor')}
																	</div>
																</div>
																<pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-black/20 p-3 text-xs text-neutral-300">{formatAuditPayload(event.payload)}</pre>
															</div>
														))}
													</div>
												)}
											</div>
										</AdminDisclosure>
										</>
									)}
				</div>
			</AdminGate>
			{confirmAction && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmAction(null); }}
					>
						<div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950/95 p-6 shadow-xl">
							<div className="grid gap-4">
								<div>
									<p className="text-lg font-semibold text-neutral-50">{confirmAction.title}</p>
									<p className="mt-1 text-sm text-neutral-400">{confirmAction.description}</p>
								</div>
								<div className="flex flex-wrap justify-end gap-3">
									<AdminButton variant="secondary" onClick={() => setConfirmAction(null)}>
										{ta('gamesConfirmDecline')}
									</AdminButton>
									<AdminButton variant="primary" onClick={() => confirmAction.onConfirm()}>
										{confirmAction.confirmLabel}
									</AdminButton>
								</div>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}
			{pendingDestructiveChanges && typeof document !== 'undefined'
				? createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
						onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingDestructiveChanges(null); }}
					>
						<div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950/95 p-6 shadow-xl">
							<div className="grid gap-4">
								<div>
									<p className="text-lg font-semibold text-neutral-50">{ta('gamesDestructiveChangeConfirm')}</p>
									<pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-black/20 p-3 text-xs text-neutral-300">{pendingDestructiveChanges.details}</pre>
								</div>
								<div className="flex flex-wrap justify-end gap-3">
									<AdminButton variant="secondary" onClick={() => setPendingDestructiveChanges(null)}>
										{ta('gamesConfirmDecline')}
									</AdminButton>
									<AdminButton variant="primary" onClick={() => pendingDestructiveChanges.onConfirm()}>
										{ta('gamesDestructiveChangeAccept')}
									</AdminButton>
								</div>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}
		</AdminSurface>
	);
}

function EpisodeSelector({ mission, selectedEpisode, onSelectedEpisodeChange, onSaved }: {
	mission: AdminGameMissionDetail;
	selectedEpisode: number;
	onSelectedEpisodeChange: (ep: number) => void;
	onSaved: (mission: AdminGameMissionDetail) => void;
}) {
	const tg = useTranslations('games');
	const episodes = mission.episodeSlottings ?? [];
	const [deleteConfirm, setDeleteConfirm] = useState<{ episodeNumber: number; occupiedCount?: number } | null>(null);

	const handleAddEpisode = async () => {
		const nextEpisodeNumber = episodes.length > 0 ? Math.max(...episodes.map((e) => e.episodeNumber)) + 1 : 2;
		const prevEpisodeNumber = nextEpisodeNumber - 1;
		const prevEpisode = episodes.find((e) => e.episodeNumber === prevEpisodeNumber);
		const sourceSlotting = prevEpisode?.slotting ?? mission.slotting;

		// Find the commander (first slot of first squad) on each side from the previous episode
		const commanderBySideId = new Map<string, unknown>();
		for (const side of sourceSlotting.sides) {
			const firstSlot = side.squads[0]?.slots[0];
			if (firstSlot?.occupant && typeof firstSlot.occupant === 'object' && 'type' in firstSlot.occupant && firstSlot.occupant.type === 'placeholder') {
				commanderBySideId.set(side.id, firstSlot.occupant);
			}
		}

		const clearedSlotting = {
			sides: sourceSlotting.sides.map((side) => ({
				...side,
				squads: side.squads.map((squad, squadIdx) => ({
					...squad,
					slots: squad.slots.map((slot, slotIdx) => ({
						...slot,
						occupant: squadIdx === 0 && slotIdx === 0 && commanderBySideId.has(side.id)
							? commanderBySideId.get(side.id)
							: null
					}))
				}))
			}))
		};

		try {
			const res = await fetch(`/api/admin/games/${mission.id}/slotting`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					episodeNumber: nextEpisodeNumber,
					slottingRevision: 1,
					slotting: clearedSlotting,
					confirmDestructive: false
				})
			});
			const json: unknown = await res.json();
			const parsed = parseAdminGameMissionResponse(json);
			if (parsed && 'mission' in parsed) {
				onSaved(parsed.mission);
				onSelectedEpisodeChange(nextEpisodeNumber);
			}
		} catch { /* network error */ }
	};

	const handleDeleteEpisode = async (episodeNumber: number, confirmOccupied: boolean) => {
		try {
			const res = await fetch(`/api/admin/games/${mission.id}/slotting`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ episodeNumber, confirmOccupied })
			});
			const json = await res.json() as Record<string, unknown>;
			if (!res.ok) {
				if (json.error === 'has_occupied_slots') {
					setDeleteConfirm({ episodeNumber, occupiedCount: json.occupiedCount as number });
					return;
				}
				return;
			}
			const parsed = parseAdminGameMissionResponse(json);
			if (parsed && 'mission' in parsed) {
				onSaved(parsed.mission);
				if (selectedEpisode === episodeNumber) onSelectedEpisodeChange(1);
			}
			setDeleteConfirm(null);
		} catch { /* network error */ }
	};

	return (
		<div className="rounded-xl border border-neutral-700 bg-neutral-900/50 px-4 py-3">
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-sm font-semibold text-neutral-300">{tg('adminEpisodeSelectorLabel')}</span>
				<div className="flex items-center gap-1">
					{episodes.map((ep) => (
						<button
							key={ep.episodeNumber}
							type="button"
							onClick={() => onSelectedEpisodeChange(ep.episodeNumber)}
							className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
								selectedEpisode === ep.episodeNumber
									? 'bg-[color:var(--accent)] text-white'
									: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
							}`}
						>
							{tg('adminEpisodeTabLabel', { number: ep.episodeNumber })}
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={() => void handleAddEpisode()}
					className="rounded-md bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-600"
					title={tg('adminAddEpisodeTitle')}
				>
					+ {tg('adminAddEpisodeButton')}
				</button>
				{selectedEpisode > 1 && (
					<button
						type="button"
						onClick={() => void handleDeleteEpisode(selectedEpisode, false)}
						className="rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
					>
						{tg('adminDeleteEpisodeButton')}
					</button>
				)}
			</div>

			{deleteConfirm && (
				<div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
					<p className="text-sm text-red-200">
						{tg('adminDeleteEpisodeOccupiedWarning', { count: deleteConfirm.occupiedCount ?? 0, episode: deleteConfirm.episodeNumber })}
					</p>
					<div className="mt-2 flex gap-2">
						<button
							type="button"
							onClick={() => void handleDeleteEpisode(deleteConfirm.episodeNumber, true)}
							className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
						>
							{tg('adminDeleteEpisodeConfirm')}
						</button>
						<button
							type="button"
							onClick={() => setDeleteConfirm(null)}
							className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
						>
							{tg('adminDeleteEpisodeCancel')}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="grid gap-2 text-sm text-neutral-200">
			<span className="text-sm font-medium text-neutral-200">{label}</span>
			{children}
		</label>
	);
}

function ActionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
	return (
		<div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
			<h3 className="text-sm font-semibold text-neutral-50">{title}</h3>
			<p className="mt-1 text-sm text-neutral-400">{description}</p>
			<div className="mt-3">{children}</div>
		</div>
	);
}

function UnitAssignmentsPanel({
	missionId,
	episodeNumber = 1,
	slotting,
	currentAssignments,
	onSaved,
	onApplyCommanders
}: {
	missionId: number;
	episodeNumber?: number;
	slotting: import('@/features/games/domain/slotting').CanonicalSlotting;
	currentAssignments: import('@/features/games/domain/types').GameUnitAssignment[];
	onSaved: (mission: AdminGameMissionDetail) => void;
	onApplyCommanders?: (sideAUnitTag: string, sideBUnitTag: string, sideAMissionSideId: string, sideBMissionSideId: string) => void;
}) {
	const tg = useTranslations('games');
	const ta = useTranslations('admin');
	const episodeAssignments = currentAssignments.filter((a) => a.episodeNumber === episodeNumber);
	const [assignments, setAssignments] = useState<Array<{ unitId: number; unitTag: string; unitName: string; sideId: string }>>(() =>
		episodeAssignments.map((a) => ({ unitId: a.unitId, unitTag: a.unitTag, unitName: a.unitName, sideId: a.sideId }))
	);
	const [availableUnits, setAvailableUnits] = useState<Array<{ id: number; tag: string; name: string; slotsAllocated: number }>>([]);
	const [loadingUnits, setLoadingUnits] = useState(true);
	const [saving, setSaving] = useState(false);
	const saveVersionRef = useRef(0);
	const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
	const [rotationDialogOpen, setRotationDialogOpen] = useState(false);
	const [rotationData, setRotationData] = useState<{
		config: { sideAName: string; sideBName: string };
		sideA: Array<{ unitId: number; unitTag: string; unitName: string }>;
		sideB: Array<{ unitId: number; unitTag: string; unitName: string }>;
		commanderPair: { sideAUnitId: number; sideAUnitTag: string; sideAUnitName: string; sideBUnitId: number; sideBUnitTag: string; sideBUnitName: string; scheduledDate: string } | null;
	} | null>(null);
	const [rotationMapSideATo, setRotationMapSideATo] = useState<string>('');
	const [applyCommanderPair, setApplyCommanderPair] = useState(false);

	useEffect(() => {
		const filtered = currentAssignments.filter((a) => a.episodeNumber === episodeNumber);
		setAssignments(filtered.map((a) => ({ unitId: a.unitId, unitTag: a.unitTag, unitName: a.unitName, sideId: a.sideId })));
	}, [currentAssignments, episodeNumber]);

	useEffect(() => {
		void (async () => {
			try {
				const res = await fetch('/api/admin/units?status=verified&hasSlots=true&limit=100', { cache: 'no-store' });
				const json = await res.json() as { units?: Array<{ id: number; tag: string; name: string; slotsAllocated: number }> };
				setAvailableUnits(json.units ?? []);
			} catch {
				setAvailableUnits([]);
			} finally {
				setLoadingUnits(false);
			}
		})();
	}, []);

	const canApplyRotation = slotting.sides.length === 2;

	const handleApplyRotation = async () => {
		try {
			const res = await fetch('/api/admin/rotation', { cache: 'no-store' });
			const json = await res.json() as {
				config?: { sideAName: string; sideBName: string };
				sideA?: Array<{ unitId: number; unitTag: string; unitName: string }>;
				sideB?: Array<{ unitId: number; unitTag: string; unitName: string }>;
				commanderSchedule?: Array<{ sideAUnitId: number; sideAUnitTag: string; sideAUnitName: string; sideBUnitId: number; sideBUnitTag: string; sideBUnitName: string; scheduledDate: string }>;
			};
			if (!json.config || !json.sideA || !json.sideB || (json.sideA.length === 0 && json.sideB.length === 0)) {
				setFeedback({ type: 'error', text: ta('rotationApplyNoRotation') });
				return;
			}
			// Find today-or-next upcoming commander pair
			const today = new Date();
			const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			const upcomingPair = (json.commanderSchedule ?? []).find((p) => p.scheduledDate >= todayStr) ?? null;
			setRotationData({ config: json.config, sideA: json.sideA, sideB: json.sideB, commanderPair: upcomingPair });
			setApplyCommanderPair(!!upcomingPair);
			setRotationMapSideATo(slotting.sides[0]?.id ?? '');
			setRotationDialogOpen(true);
		} catch {
			setFeedback({ type: 'error', text: ta('rotationErrorSave') });
		}
	};

	const confirmApplyRotation = async () => {
		if (!rotationData) return;
		const sideAMissionSideId = rotationMapSideATo;
		const sideBMissionSideId = slotting.sides.find((s) => s.id !== sideAMissionSideId)?.id ?? '';
		const pair = applyCommanderPair ? rotationData.commanderPair : null;

		// Build side lists, putting the commander unit first if applying commander pair
		const buildSide = (units: typeof rotationData.sideA, commanderUnitId: number | null, missionSideId: string) => {
			const result: Array<{ unitId: number; unitTag: string; unitName: string; sideId: string }> = [];
			if (commanderUnitId != null) {
				const commander = units.find((u) => u.unitId === commanderUnitId);
				if (commander) result.push({ unitId: commander.unitId, unitTag: commander.unitTag, unitName: commander.unitName, sideId: missionSideId });
			}
			for (const u of units) {
				if (commanderUnitId != null && u.unitId === commanderUnitId) continue;
				result.push({ unitId: u.unitId, unitTag: u.unitTag, unitName: u.unitName, sideId: missionSideId });
			}
			return result;
		};

		const newAssignments = [
			...buildSide(rotationData.sideA, pair?.sideAUnitId ?? null, sideAMissionSideId),
			...buildSide(rotationData.sideB, pair?.sideBUnitId ?? null, sideBMissionSideId),
		];

		await saveAssignments(newAssignments);
		if (pair && onApplyCommanders) {
			onApplyCommanders(pair.sideAUnitTag, pair.sideBUnitTag, sideAMissionSideId, sideBMissionSideId);
		}

		setRotationDialogOpen(false);
		setRotationData(null);
	};

	const saveAssignments = async (next: typeof assignments) => {
		const version = ++saveVersionRef.current;
		setAssignments(next);
		setSaving(true);
		setFeedback(null);
		try {
			const res = await fetch(`/api/admin/games/${missionId}/unit-assignments`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					episodeNumber,
					assignments: next.map((a) => ({ unitId: a.unitId, sideId: a.sideId }))
				})
			});
			if (version !== saveVersionRef.current) return;
			const json: unknown = await res.json();
			const parsed = parseAdminGameMissionResponse(json);
			if (parsed && !('error' in parsed)) {
				onSaved(parsed.mission);
			} else {
				const code = parsed && 'error' in parsed ? parsed.error : 'unknown';
				setFeedback({ type: 'error', text: tg('adminUnitAssignmentsErrorPrefix', { error: code }) });
			}
		} catch {
			if (version !== saveVersionRef.current) return;
			setFeedback({ type: 'error', text: tg('adminUnitAssignmentsNetworkError') });
		} finally {
			if (version === saveVersionRef.current) setSaving(false);
		}
	};

	const addUnit = (unitId: number) => {
		if (saving) return;
		const unit = availableUnits.find((u) => u.id === unitId);
		if (!unit || assignments.some((a) => a.unitId === unitId)) return;
		void saveAssignments([...assignments, { unitId: unit.id, unitTag: unit.tag, unitName: unit.name, sideId: slotting.sides[0]?.id ?? '' }]);
	};

	const removeUnit = (unitId: number) => {
		if (saving) return;
		void saveAssignments(assignments.filter((a) => a.unitId !== unitId));
	};

	const updateSide = (unitId: number, sideId: string) => {
		if (saving) return;
		void saveAssignments(assignments.map((a) => (a.unitId === unitId ? { ...a, sideId } : a)));
	};

	const unassignedUnits = availableUnits.filter((u) => !assignments.some((a) => a.unitId === u.id));

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-neutral-400">{tg('adminUnitAssignmentsSubtitle')}</p>
				{canApplyRotation ? (
					<button
						type="button"
						onClick={() => { void handleApplyRotation(); }}
						className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800"
					>
						{ta('rotationApplyTitle')}
					</button>
				) : (
					<span className="text-xs text-neutral-500" title={ta('rotationApplyNeedTwoSides')}>
						{ta('rotationApplyTitle')}
					</span>
				)}
			</div>

			{/* Apply Rotation Dialog */}
			{rotationDialogOpen && rotationData && (
				<div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
					<p className="mb-3 text-sm font-semibold text-neutral-50">{ta('rotationApplyDescription')}</p>
					<label className="mb-3 flex items-center gap-2 text-sm text-neutral-300">
						<span>{ta('rotationApplyMapSideA', { sideName: rotationData.config.sideAName })}</span>
						<select
							value={rotationMapSideATo}
							onChange={(e) => setRotationMapSideATo(e.target.value)}
							className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
						>
							{slotting.sides.map((side) => (
								<option key={side.id} value={side.id}>{sideDisplayName(side)}</option>
							))}
						</select>
					</label>
					<div className="mb-3 grid gap-1 text-xs text-neutral-400">
						<span>{rotationData.config.sideAName}: {rotationData.sideA.map((u) => u.unitTag).join(', ') || '—'}</span>
						<span>{rotationData.config.sideBName}: {rotationData.sideB.map((u) => u.unitTag).join(', ') || '—'}</span>
					</div>
					{rotationData.commanderPair && (
						<label className="mb-3 flex items-center gap-2 text-sm text-neutral-300">
							<input
								type="checkbox"
								checked={applyCommanderPair}
								onChange={(e) => setApplyCommanderPair(e.target.checked)}
								className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 text-[color:var(--accent)] accent-[color:var(--accent)]"
							/>
							<span>
								{ta('rotationApplyCommanderPair', {
									sideA: rotationData.commanderPair.sideAUnitTag,
									sideB: rotationData.commanderPair.sideBUnitTag,
									date: rotationData.commanderPair.scheduledDate,
								})}
							</span>
						</label>
					)}
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={saving}
							onClick={() => { void confirmApplyRotation(); }}
							className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{ta('rotationApplyConfirm')}
						</button>
						<button
							type="button"
							onClick={() => { setRotationDialogOpen(false); setRotationData(null); }}
							className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800"
						>
							{ta('rotationApplyCancel')}
						</button>
					</div>
				</div>
			)}

			{assignments.length > 0 ? (
				<div className="grid gap-2">
					{assignments.map((a) => (
						<div key={a.unitId} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2">
							<div className="min-w-0">
								<span className="text-sm font-semibold text-neutral-100">{a.unitTag}</span>
								<span className="ml-1.5 text-xs text-neutral-400">({a.unitName})</span>
							</div>
							<div className="flex items-center gap-2">
								<select
									value={a.sideId}
									onChange={(e) => updateSide(a.unitId, e.target.value)}
									className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
								>
									{slotting.sides.map((side) => (
										<option key={side.id} value={side.id}>{sideDisplayName(side)}</option>
									))}
								</select>
								<button
									type="button"
									onClick={() => removeUnit(a.unitId)}
									className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/20"
								>
									{tg('adminUnitAssignmentsRemove')}
								</button>
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="text-sm text-neutral-500">{tg('adminUnitAssignmentsNoneAssigned')}</p>
			)}

			{unassignedUnits.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-neutral-400">{tg('adminUnitAssignmentsAddUnit')}</span>
					{loadingUnits ? (
						<span className="text-xs text-neutral-500">{tg('adminUnitAssignmentsLoading')}</span>
					) : (
						<select
							value=""
							onChange={(e) => {
								const id = Number(e.target.value);
								if (id) addUnit(id);
							}}
							className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
						>
							<option value="">{tg('adminSlottingEditorSelectUnit')}</option>
							{unassignedUnits.map((u) => (
								<option key={u.id} value={u.id}>{u.tag} ({u.name}) - {u.slotsAllocated} slots</option>
							))}
						</select>
					)}
				</div>
			) : null}

			{feedback ? (
				<p className={`text-sm ${feedback.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{feedback.text}</p>
			) : null}
		</div>
	);
}
