'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AdminButton, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { adminReplaysResponseSchema, type ReplayGameListItem } from '../domain/api';
import ReplayReviewPanel from './ReplayReviewPanel';

const th =
	'whitespace-nowrap border-b border-neutral-800 px-3 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500';
const td = 'whitespace-nowrap border-t border-neutral-800 px-3 py-2.5 align-middle text-sm text-neutral-200';
const tdNum = `${td} text-center tabular-nums`;

function formatSize(bytes: number, locale: string): string {
	if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString(locale)} KB`;
	const value = (bytes / 1_000_000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	return `${value} MB`;
}

async function fetchReplayPage(offset: number) {
	const res = await fetch(`/api/admin/replays?offset=${offset}`, { cache: 'no-store' });
	const parsed = adminReplaysResponseSchema.safeParse(await res.json());
	if (!res.ok || !parsed.success) throw new Error('replays_load_failed');
	return parsed.data;
}

export default function AdminReplaysPage() {
	const t = useTranslations('replays');
	const locale = useLocale();
	const { timeZone, hourCycle } = useViewerDateTimePreferences();

	const [games, setGames] = useState<ReplayGameListItem[] | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [failed, setFailed] = useState(false);
	const [loading, setLoading] = useState(false);
	const [selectedId, setSelectedId] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const page = await fetchReplayPage(0);
				if (cancelled) return;
				setGames(page.games);
				setHasMore(page.hasMore);
			} catch {
				if (!cancelled) setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const loadMore = useCallback(async (offset: number) => {
		setLoading(true);
		try {
			const page = await fetchReplayPage(offset);
			setGames((current) => [...(current ?? []), ...page.games]);
			setHasMore(page.hasMore);
			setFailed(false);
		} catch {
			setFailed(true);
		} finally {
			setLoading(false);
		}
	}, []);

	// The review panel changes a game's link and status; the list shows both.
	const refreshList = useCallback(async () => {
		try {
			const page = await fetchReplayPage(0);
			setGames(page.games);
			setHasMore(page.hasMore);
		} catch {
			setFailed(true);
		}
	}, []);

	const formatTime = (value: string | null) => formatLocalizedDateTime(value, { locale, timeZone, hourCycle }) ?? '—';

	return (
		<AdminSurface>
			<div className="grid gap-6">
				<div className="grid gap-2">
					<AdminToolbar title={t('adminTitle')} />
					<p className="text-sm text-neutral-400">{t('adminSubtitle')}</p>
				</div>

				{failed ? <p className="text-sm text-red-300">{t('adminLoadError')}</p> : null}

				{selectedId !== null ? (
					<ReplayReviewPanel key={selectedId} gameId={selectedId} onChanged={() => void refreshList()} />
				) : null}

				{games === null ? (
					failed ? null : <p className="text-sm text-neutral-300">{t('adminLoading')}</p>
				) : games.length === 0 ? (
					<p className="text-sm text-neutral-300">{t('adminEmpty')}</p>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full border-collapse">
							<thead>
								<tr>
									<th className={th}>{t('adminColGame')}</th>
									<th className={th}>{t('adminColMission')}</th>
									<th className={th}>{t('adminColStatus')}</th>
									<th className={th}>{t('adminColServer')}</th>
									<th className={th}>{t('adminColStarted')}</th>
									<th className={th}>{t('adminColSegments')}</th>
									<th className={th}>{t('adminColSize')}</th>
									<th className={th}>{t('adminColStats')}</th>
									<th className={th}>{t('adminColOver')}</th>
									<th className={th}>{t('adminColReported')}</th>
									<th className={th} />
								</tr>
							</thead>
							<tbody>
								{games.map((game) => (
									<tr key={game.id}>
										<td className={td}>
											<div className="font-semibold text-neutral-100">{game.mission ?? game.session}</div>
											{game.mission ? <div className="font-mono text-xs text-neutral-500">{game.session}</div> : null}
										</td>
										<td className={td}>
											{game.missionTitle ? `${game.missionTitle} · ${t('adminEpisodeShort', { episode: game.episodeNumber ?? 1 })}` : '—'}
										</td>
										<td className={td}>{game.publishedAt ? t('adminStatusPublished') : t('adminStatusHidden')}</td>
										<td className={`${td} font-mono text-xs`}>{game.serverId}</td>
										<td className={td}>
											{game.startedAt === null ? '—' : formatTime(new Date(game.startedAt * 1000).toISOString())}
										</td>
										<td className={tdNum}>{game.segmentCount}</td>
										<td className={tdNum}>{formatSize(game.size, locale)}</td>
										<td className={tdNum}>{game.hasStats ? t('adminYes') : '—'}</td>
										<td className={td}>{game.over === 'stopped' ? t('adminOverStopped') : t('adminOverAbandoned')}</td>
										<td className={td}>
											<div>{formatTime(game.lastPostedAt)}</div>
											{game.postCount > 1 ? (
												<div className="text-xs text-neutral-500">{t('adminReportCount', { count: game.postCount })}</div>
											) : null}
										</td>
										<td className={td}>
											<AdminButton variant="secondary" className="h-8" onClick={() => setSelectedId(game.id === selectedId ? null : game.id)}>
												{game.id === selectedId ? t('adminClose') : t('adminReview')}
											</AdminButton>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{hasMore ? (
					<AdminButton variant="secondary" className="w-fit" disabled={loading} onClick={() => void loadMore(games?.length ?? 0)}>
						{t('adminLoadMore')}
					</AdminButton>
				) : null}
			</div>
		</AdminSurface>
	);
}
