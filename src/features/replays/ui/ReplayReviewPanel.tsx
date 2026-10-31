'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AdminButton } from '@/features/admin/ui/root';
import { parseDateTimeValue } from '@/platform/dateTime';
import { adminReplayDetailResponseSchema, type ReplayGameDetail } from '../domain/api';
import MapUpload from './MapUpload';
import { terrainName } from './terrainName';

type Mission = { id: number; title: string; shortCode: string | null; startsAt: string | null };
type Feedback = { tone: 'ok' | 'err'; text: string } | null;

const selectClass =
	'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';

async function fetchDetail(gameId: number) {
	const res = await fetch(`/api/admin/replays?gameId=${gameId}`, { cache: 'no-store' });
	const parsed = adminReplayDetailResponseSchema.safeParse(await res.json());
	if (!res.ok || !parsed.success) throw new Error('replay_detail_failed');
	return parsed.data;
}

async function act(body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
	const res = await fetch('/api/admin/replays', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { ok: res.ok, json };
}

// The mission planned closest to the game's start is almost always the one it was.
function nearestMission(missions: Mission[], startedAt: number | null): number | null {
	if (startedAt === null) return null;
	let best: { id: number; distance: number } | null = null;
	for (const mission of missions) {
		const start = mission.startsAt ? parseDateTimeValue(mission.startsAt) : null;
		if (!start) continue;
		const distance = Math.abs(start.getTime() / 1000 - startedAt);
		if (distance < 18 * 3600 && (!best || distance < best.distance)) best = { id: mission.id, distance };
	}
	return best?.id ?? null;
}

export default function ReplayReviewPanel({ gameId, onChanged }: { gameId: number; onChanged: () => void }) {
	const t = useTranslations('replays');
	const locale = useLocale();
	const [game, setGame] = useState<ReplayGameDetail | null>(null);
	const [missions, setMissions] = useState<Mission[]>([]);
	const [missionId, setMissionId] = useState('');
	const [episode, setEpisode] = useState('1');
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState<Feedback>(null);

	const describeError = useCallback(
		(code: unknown): string => {
			switch (code) {
				case 'not_linked': return t('adminErrNotLinked');
				case 'mission_not_found': return t('adminErrMissionNotFound');
				case 'published': return t('adminErrPublishedLinked');
				case 'no_stats': return t('adminErrNoStats');
				case 'storage_unavailable': return t('adminErrStorage');
				case 'episode_already_published': return t('adminErrEpisodePublished');
				case 'duplicate_snapshot': return t('adminErrDuplicate');
				case 'invalid_snapshot':
				case 'invalid_json': return t('adminErrInvalidSnapshot');
				default: return `${t('adminErrGeneric')}: ${String(code)}`;
			}
		},
		[t]
	);

	const applyDetail = useCallback((detail: Awaited<ReturnType<typeof fetchDetail>>) => {
		setGame(detail.game);
		setMissions(detail.missions);
		const preset = detail.game.missionId ?? nearestMission(detail.missions, detail.game.startedAt);
		setMissionId(preset === null ? '' : String(preset));
		setEpisode(String(detail.game.episodeNumber ?? 1));
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const detail = await fetchDetail(gameId);
				if (!cancelled) applyDetail(detail);
			} catch {
				if (!cancelled) setFeedback({ tone: 'err', text: t('adminLoadError') });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [gameId, applyDetail, t]);

	const run = useCallback(
		async (body: Record<string, unknown>, success: (json: Record<string, unknown>) => string) => {
			setBusy(true);
			setFeedback(null);
			try {
				const { ok, json } = await act({ ...body, gameId });
				if (!ok) {
					setFeedback({ tone: 'err', text: describeError(json.error) });
					return;
				}
				setFeedback({ tone: 'ok', text: success(json) });
				applyDetail(await fetchDetail(gameId));
				onChanged();
			} catch {
				setFeedback({ tone: 'err', text: t('adminErrGeneric') });
			} finally {
				setBusy(false);
			}
		},
		[gameId, describeError, applyDetail, onChanged, t]
	);

	const announcementText = useCallback(
		(value: unknown) => {
			switch (value) {
				case 'sent': return t('adminAnnounceSent');
				case 'skipped': return t('adminAnnounceSkipped');
				case 'failed': return t('adminAnnounceFailed');
				default: return t('adminAnnounceEarlier');
			}
		},
		[t]
	);

	const missionOptions = useMemo(() => missions.slice(0, 200), [missions]);

	if (!game) {
		return (
			<div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
				{feedback ? feedback.text : t('adminLoading')}
			</div>
		);
	}

	const linked = game.missionId !== null && game.episodeNumber !== null;
	const published = game.publishedAt !== null;

	return (
		<div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<p className="text-sm font-semibold text-neutral-100">{game.missionTitle ?? game.mission ?? game.session}</p>
					<p className="font-mono text-xs text-neutral-500">{game.session}</p>
				</div>
				<Link href={`/replays/${game.id}`} locale={locale} className="text-sm font-semibold text-[color:var(--accent)] hover:underline">
					{t('adminOpenViewer')}
				</Link>
			</div>

			{feedback ? (
				<p className={feedback.tone === 'ok' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>{feedback.text}</p>
			) : null}

			<section className="grid gap-2">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminLinkTitle')}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="grid min-w-64 flex-1 gap-1 text-xs text-neutral-400">
						{t('adminMissionLabel')}
						<select className={selectClass} value={missionId} disabled={busy || published} onChange={(e) => setMissionId(e.target.value)}>
							<option value="">—</option>
							{missionOptions.map((mission) => (
								<option key={mission.id} value={mission.id}>
									{mission.title}
									{mission.startsAt ? ` · ${mission.startsAt.slice(0, 10)}` : ''}
								</option>
							))}
						</select>
					</label>
					<label className="grid w-28 gap-1 text-xs text-neutral-400">
						{t('adminEpisodeLabel')}
						<input
							className={selectClass}
							type="number"
							min={1}
							max={99}
							value={episode}
							disabled={busy || published}
							onChange={(e) => setEpisode(e.target.value)}
						/>
					</label>
					<AdminButton
						variant="secondary"
						disabled={busy || published || !missionId || !(Number(episode) >= 1)}
						onClick={() =>
							void run({ action: 'link', missionId: Number(missionId), episodeNumber: Number(episode) }, () => t('adminLinked'))
						}
					>
						{t('adminLinkButton')}
					</AdminButton>
				</div>
			</section>

			<section className="grid gap-2">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminStatsTitle')}</p>
				<div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
					<span>
						{!game.hasStats
							? t('adminStatsNone')
							: game.statistics === null
								? t('adminStatsNotImported')
								: game.statistics.status === 'published'
									? t('adminStatsPublished')
									: t('adminStatsDraft')}
					</span>
					{game.hasStats && game.statistics?.status !== 'published' ? (
						<AdminButton
							variant="secondary"
							disabled={busy || !linked}
							onClick={() => void run({ action: 'importStats' }, () => t('adminStatsImported'))}
						>
							{t('adminImportStats')}
						</AdminButton>
					) : null}
					{game.statistics ? (
						<Link href="/admin/stats" locale={locale} className="text-sm font-semibold text-[color:var(--accent)] hover:underline">
							{t('adminOpenStatsAdmin')}
						</Link>
					) : null}
				</div>
			</section>

			<section className="grid gap-2">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminPublishTitle')}</p>
				<div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
					<span>{published ? t('adminStatusPublished') : t('adminStatusHidden')}</span>
					{published ? (
						<AdminButton variant="secondary" disabled={busy} onClick={() => void run({ action: 'unpublish' }, () => t('adminUnpublished'))}>
							{t('adminUnpublish')}
						</AdminButton>
					) : (
						<AdminButton
							variant="primary"
							disabled={busy || !linked}
							onClick={() => void run({ action: 'publish' }, (json) => `${t('adminPublishedNow')} ${announcementText(json.announcement)}`)}
						>
							{t('adminPublish')}
						</AdminButton>
					)}
				</div>
				{!game.hasMap ? <p className="text-xs text-neutral-500">{t('adminMapMissing')}</p> : null}
			</section>

			{game.world ? (
				<section className="grid gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
						{t('adminMapTitle', { terrain: terrainName(game.world) ?? game.world })}
					</p>
					<MapUpload
						world={game.world}
						map={game.map}
						onSaved={() => {
							void fetchDetail(gameId).then(applyDetail);
							onChanged();
						}}
					/>
				</section>
			) : null}
		</div>
	);
}
