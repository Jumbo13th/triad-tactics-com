'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AdminButton, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import { formatLocalizedDateTime } from '@/platform/dateTime';
import { useViewerDateTimePreferences } from '@/platform/useViewerDateTimePreferences';
import { adminReplaysResponseSchema, type ReplayGameListItem } from '../domain/api';
import ReplayReviewPanel from './ReplayReviewPanel';

const th =
	'whitespace-nowrap border-b border-neutral-800 px-3 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500';
const td = 'whitespace-nowrap border-t border-neutral-800 px-3 py-2.5 align-middle text-sm text-neutral-200';
const COLUMNS = 5;

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

	// A review changes its game's link and status; the row shows both, and the rest of the list,
	// pages loaded included, stays as it is.
	const updateGame = useCallback((changed: ReplayGameListItem) => {
		setGames((current) => current?.map((game) => (game.id === changed.id ? changed : game)) ?? current);
	}, []);

	const formatTime = (value: string | null) => formatLocalizedDateTime(value, { locale, timeZone, hourCycle }) ?? '—';

	const statsLabel = (game: ReplayGameListItem) => {
		if (game.statsStatus === 'published') return t('adminStatsShortPublished');
		if (game.statsStatus === 'draft') return t('adminStatsShortDraft');
		return <span className="text-neutral-500">{game.hasStats ? t('adminStatsShortWaiting') : '—'}</span>;
	};

	return (
		<AdminSurface>
			<div className="grid gap-6">
				<div className="grid gap-2">
					<AdminToolbar title={t('adminTitle')} />
					<p className="text-sm text-neutral-400">{t('adminSubtitle')}</p>
				</div>

				{failed ? <p className="text-sm text-red-300">{t('adminLoadError')}</p> : null}

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
									<th className={th}>{t('adminColStats')}</th>
									<th className={th}>{t('adminColReplay')}</th>
									<th className={th}>{t('adminColStarted')}</th>
									<th className={th} />
								</tr>
							</thead>
							<tbody>
								{games.map((game) => {
									const open = game.id === selectedId;
									const name = game.missionTitle
										? `${game.missionTitle} · ${t('adminEpisodeShort', { episode: game.episodeNumber ?? 1 })}`
										: (game.mission ?? game.session);
									return (
										<Fragment key={game.id}>
											<tr className={open ? 'bg-white/[0.03]' : undefined}>
												<td className={`${td} max-w-72`}>
													<div className="flex items-baseline gap-2">
														<span className="truncate font-semibold text-neutral-100" title={name}>
															{name}
														</span>
														{game.missionTitle ? null : (
															<span className="shrink-0 rounded border border-amber-300/30 px-1.5 text-[11px] text-amber-200/90">
																{t('adminNotLinked')}
															</span>
														)}
													</div>
													{name !== game.session ? <div className="truncate font-mono text-xs text-neutral-500">{game.session}</div> : null}
												</td>
												<td className={td}>{statsLabel(game)}</td>
												<td className={td}>
													{game.publishedAt ? (
														t('adminStatusPublished')
													) : (
														<span className="text-neutral-400">{t('adminStatusHidden')}</span>
													)}
												</td>
												<td className={td}>
													{game.startedAt === null ? '—' : formatTime(new Date(game.startedAt * 1000).toISOString())}
												</td>
												<td className={`${td} text-right`}>
													<AdminButton variant="secondary" className="h-8" onClick={() => setSelectedId(open ? null : game.id)}>
														{open ? t('adminClose') : t('adminReview')}
													</AdminButton>
												</td>
											</tr>
											{open ? (
												<tr>
													<td colSpan={COLUMNS} className="border-t border-neutral-800 px-0 pb-4 pt-2">
														<ReplayReviewPanel key={game.id} gameId={game.id} onChanged={updateGame} />
													</td>
												</tr>
											) : null}
										</Fragment>
									);
								})}
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
