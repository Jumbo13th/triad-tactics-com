'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdminButton, AdminSurface } from '@/features/admin/ui/root';
import type { GameStatsMeta, PlayerMappingPreview, Season, StatsMapping, UnitScoreWithUnit } from '../domain/types';
import type { GameStatsAdminView } from '../useCases/adminView';

import { fmt1, fmtMult, tdNum, tdText, thText } from './tableStyles';
import { SortHeader, sortRows, useSortState, type SortDir } from './sorting';

const inputClass =
	'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';
const selectClass =
	'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-50 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';

type MissionOption = { id: number; title: string; shortCode: string; status: string; startsAt: string };
type Feedback = { tone: 'ok' | 'err'; text: string } | null;

type PreviewSortKey =
	| 'unit'
	| 'side'
	| 'kills'
	| 'deaths'
	| 'teamkills'
	| 'survivors'
	| 'objectives'
	| 'participants'
	| 'occupancy'
	| 'multiplier'
	| 'final';

const PREVIEW_DEFAULT_DIR: Record<PreviewSortKey, SortDir> = {
	unit: 'asc',
	side: 'asc',
	kills: 'desc',
	deaths: 'desc',
	teamkills: 'desc',
	survivors: 'desc',
	objectives: 'desc',
	participants: 'desc',
	occupancy: 'desc',
	multiplier: 'desc',
	final: 'desc',
};

function previewValueOf(row: UnitScoreWithUnit, key: PreviewSortKey): number | string {
	if (key === 'unit') return row.unitTag.toLowerCase();
	if (key === 'side') return row.side;
	if (key === 'objectives') return row.objectivePoints;
	if (key === 'occupancy') return row.occupancyPct ?? -1;
	if (key === 'final') return row.finalPoints;
	return row[key];
}

async function api(body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
	const res = await fetch('/api/admin/stats', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const json = (await res.json()) as Record<string, unknown>;
	return { ok: res.ok, json };
}

function mappingFingerprint(mapping: StatsMapping): string {
	const guids = Object.keys(mapping.guidUnit).sort();
	const commanders = mapping.commanders
		.slice()
		.sort((a, b) => a.faction.localeCompare(b.faction))
		.map((c) => `${c.faction}=${c.unitId}`);
	return JSON.stringify([guids.map((g) => `${g}:${mapping.guidUnit[g]}`), mapping.winner, commanders]);
}

export default function AdminStatsPage() {
	const t = useTranslations('stats');

	const [seasons, setSeasons] = useState<Season[]>([]);
	const [activeSeason, setActiveSeason] = useState<Season | null>(null);
	const [recentGames, setRecentGames] = useState<GameStatsMeta[]>([]);
	const [hasMoreGames, setHasMoreGames] = useState(false);
	const [missions, setMissions] = useState<MissionOption[]>([]);
	const [feedback, setFeedback] = useState<Feedback>(null);

	const [seasonName, setSeasonName] = useState('');
	const [missionId, setMissionId] = useState('');
	const [missionGames, setMissionGames] = useState<GameStatsMeta[]>([]);
	const [episodeNumber, setEpisodeNumber] = useState('1');
	const [snapshotText, setSnapshotText] = useState('');
	const [replaceDraft, setReplaceDraft] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [view, setView] = useState<GameStatsAdminView | null>(null);
	const [busy, setBusy] = useState(false);
	const detailRef = useRef<HTMLDivElement>(null);

	const describeError = useCallback(
		(code: string): string => {
			switch (code) {
				case 'invalid_json': return t('adminErrInvalidJson');
				case 'invalid_snapshot': return t('adminErrInvalidSnapshot');
				case 'mission_not_found': return t('adminErrMissionNotFound');
				case 'duplicate_snapshot': return t('adminErrDuplicateSnapshot');
				case 'episode_already_published': return t('adminErrEpisodePublished');
				case 'episode_has_draft': return t('adminErrEpisodeDraft');
				case 'not_draft': return t('adminErrNotDraft');
				default: return `${t('adminError')}: ${code}`;
			}
		},
		[t]
	);

	const reloadOverview = useCallback(async () => {
		const res = await fetch('/api/admin/stats');
		if (!res.ok) return;
		const json = (await res.json()) as {
			seasons: Season[];
			activeSeason: Season | null;
			recentGames: GameStatsMeta[];
			missions: MissionOption[];
		};
		setSeasons(json.seasons);
		setActiveSeason(json.activeSeason);
		setRecentGames(json.recentGames);
		setHasMoreGames(json.recentGames.length === 30);
		setMissions(json.missions);
	}, []);

	const loadMoreGames = useCallback(async () => {
		const res = await fetch(`/api/admin/stats?gamesOffset=${recentGames.length}`);
		if (!res.ok) return;
		const json = (await res.json()) as { games: GameStatsMeta[] };
		setRecentGames((current) => [...current, ...json.games]);
		setHasMoreGames(json.games.length === 30);
	}, [recentGames.length]);

	useEffect(() => {
		void reloadOverview();
	}, [reloadOverview]);

	useEffect(() => {
		if (!feedback) return;
		const timer = window.setTimeout(() => setFeedback(null), feedback.tone === 'ok' ? 4000 : 8000);
		return () => window.clearTimeout(timer);
	}, [feedback]);

	const openGame = useCallback(async (gameStatsId: number) => {
		const res = await fetch(`/api/admin/stats?gameStatsId=${gameStatsId}`);
		if (!res.ok) return;
		const json = (await res.json()) as { view: GameStatsAdminView };
		setView(json.view);
	}, []);

	// Keyed on the id so mapping-save refreshes don't re-scroll.
	const viewGameId = view?.meta.id ?? null;
	useEffect(() => {
		if (viewGameId !== null) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [viewGameId]);

	const onSelectMission = useCallback(async (id: string) => {
		setMissionId(id);
		setMissionGames([]);
		if (!id) return;
		const res = await fetch(`/api/admin/stats?missionId=${id}`);
		if (!res.ok) return;
		const json = (await res.json()) as { games: GameStatsMeta[] };
		setMissionGames(json.games);
		const nextEpisode = json.games.reduce((max, game) => Math.max(max, game.episodeNumber), 0) + 1;
		setEpisodeNumber(String(nextEpisode));
	}, []);

	async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (file) setSnapshotText(await file.text());
		event.target.value = '';
	}

	async function run(body: unknown, okText: string): Promise<Record<string, unknown> | null> {
		setBusy(true);
		try {
			const { ok, json } = await api(body);
			if (!ok) {
				setFeedback({ tone: 'err', text: describeError(String(json.error ?? 'unknown')) });
				return null;
			}
			setFeedback({ tone: 'ok', text: okText });
			return json;
		} finally {
			setBusy(false);
		}
	}

	async function onCreateSeason() {
		const json = await run({ action: 'createSeason', name: seasonName }, t('adminSeasonCreated'));
		if (json) {
			setSeasonName('');
			await reloadOverview();
		}
	}

	async function onCloseSeason(seasonId: number) {
		const json = await run({ action: 'closeSeason', seasonId }, t('adminSeasonClosed'));
		if (json) await reloadOverview();
	}

	async function onUpload() {
		const json = await run(
			{
				action: 'upload',
				missionId: Number(missionId),
				episodeNumber: Number(episodeNumber) || 1,
				snapshotText,
				replaceDraft,
			},
			t('adminUploaded')
		);
		if (json) {
			setSnapshotText('');
			setView(json.view as GameStatsAdminView);
			await reloadOverview();
			if (missionId) await onSelectMission(missionId);
		}
	}

	async function onSaveMapping(mapping: StatsMapping): Promise<boolean> {
		if (!view) return false;
		const json = await run({ action: 'updateMapping', gameStatsId: view.meta.id, mapping }, t('adminMappingSaved'));
		if (json) setView(json.view as GameStatsAdminView);
		return json !== null;
	}

	async function onPublish() {
		if (!view) return;
		const json = await run({ action: 'publish', gameStatsId: view.meta.id }, t('adminPublished'));
		if (json) {
			await openGame(view.meta.id);
			await reloadOverview();
		}
	}

	async function onUnpublish() {
		if (!view) return;
		const json = await run({ action: 'unpublish', gameStatsId: view.meta.id }, t('adminUnpublished'));
		if (json) {
			await openGame(view.meta.id);
			await reloadOverview();
		}
	}

	async function onDeleteDraft() {
		if (!view || !window.confirm(t('adminConfirmDeleteDraft'))) return;
		const json = await run({ action: 'deleteDraft', gameStatsId: view.meta.id }, t('adminDraftDeleted'));
		if (json) {
			setView(null);
			await reloadOverview();
			if (missionId) await onSelectMission(missionId);
		}
	}

	return (
		<section className="grid gap-6">
			<h1 className="text-3xl font-semibold tracking-tight text-neutral-50">{t('adminTitle')}</h1>

			{feedback && (
				<p
					role="status"
					className={`fixed bottom-6 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg shadow-black/40 ${
						feedback.tone === 'ok' ? 'border-emerald-800 bg-emerald-950/95 text-emerald-300' : 'border-red-800 bg-red-950/95 text-red-300'
					}`}
				>
					{feedback.text}
				</p>
			)}

			{/* Seasons */}
			<AdminSurface>
				<div className="grid gap-4">
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{t('adminSeasons')}</h2>
					<div className="flex flex-wrap items-center gap-3">
						<input
							value={seasonName}
							onChange={(e) => setSeasonName(e.target.value)}
							placeholder={t('adminSeasonName')}
							className={`${inputClass} h-11 max-w-64`}
						/>
						<AdminButton variant="primary" className="h-11" onClick={onCreateSeason} disabled={busy || seasonName.trim() === '' || activeSeason !== null}>
							{t('adminSeasonCreate')}
						</AdminButton>
					</div>
					{seasons.length > 0 && (
						<ul className="grid gap-2 text-sm">
							{seasons.map((season) => (
								<li
									key={season.id}
									className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-neutral-800 bg-white/[0.03] px-4 py-2.5"
								>
									<span className="flex items-center gap-3">
										<span className="font-semibold text-neutral-100">{season.name}</span>
										<span
											className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
												season.status === 'active'
													? 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
													: 'border-neutral-700 text-neutral-400'
											}`}
										>
											{season.status}
										</span>
									</span>
									{season.status === 'active' && (
										<button
											onClick={() => onCloseSeason(season.id)}
											disabled={busy}
											className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold capitalize text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
										>
											{t('adminSeasonClose')}
										</button>
									)}
								</li>
							))}
						</ul>
					)}
				</div>
			</AdminSurface>

			{/* Upload */}
			<AdminSurface>
				<div className="grid gap-4">
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{t('adminUpload')}</h2>
					<p className="text-sm text-neutral-400">{t('adminUploadHint')}</p>
					<div className="flex flex-wrap items-end gap-x-4 gap-y-3">
						<label className="grid min-w-64 flex-1 gap-1.5 sm:max-w-96">
							<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminMission')}</span>
							<select value={missionId} onChange={(e) => void onSelectMission(e.target.value)} className={`${selectClass} h-11 px-3`}>
								<option value="">{t('adminSelectMission')}</option>
								{missions.map((mission) => (
									<option key={mission.id} value={mission.id}>
										{mission.title}
										{mission.startsAt ? ` — ${mission.startsAt.slice(0, 10)}` : ''}
									</option>
								))}
							</select>
						</label>
						<label className="grid w-24 gap-1.5">
							<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminEpisode')}</span>
							<input
								value={episodeNumber}
								onChange={(e) => setEpisodeNumber(e.target.value)}
								inputMode="numeric"
								className={`${inputClass} h-11 text-center`}
							/>
						</label>
						<label className="flex h-11 items-center gap-2 text-sm text-neutral-300">
							<input type="checkbox" checked={replaceDraft} onChange={(e) => setReplaceDraft(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
							{t('adminReplaceDraft')}
						</label>
					</div>
					{missionGames.length > 0 && (
						<div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
							{missionGames.map((game) => (
								<button
									key={game.id}
									onClick={() => openGame(game.id)}
									className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 uppercase tracking-[0.1em] transition hover:border-[color:var(--accent)]/50 ${
										game.status === 'published'
											? 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
											: 'border-neutral-700 text-neutral-400'
									}`}
								>
									E{game.episodeNumber} · {game.status}
								</button>
							))}
						</div>
					)}
					<textarea
						value={snapshotText}
						onChange={(e) => setSnapshotText(e.target.value)}
						placeholder='{"schema":"ll-stats/1", ...}'
						rows={6}
						className={`${inputClass} font-mono text-xs`}
					/>
					<div className="flex flex-wrap items-center gap-3">
						<AdminButton variant="primary" className="h-11" onClick={onUpload} disabled={busy || snapshotText.trim() === '' || missionId === ''}>
							{t('adminUploadButton')}
						</AdminButton>
						<input ref={fileInputRef} type="file" accept=".json,application/json" onChange={onPickFile} className="hidden" />
						<AdminButton variant="secondary" className="h-11" onClick={() => fileInputRef.current?.click()} disabled={busy}>
							{t('adminLoadFile')}
						</AdminButton>
					</div>
				</div>
			</AdminSurface>

			{/* Games */}
			<AdminSurface>
				<div className="grid gap-4">
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50">{t('recentGames')}</h2>
					{recentGames.length === 0 && <p className="text-sm text-neutral-400">{t('noGames')}</p>}
					<ul className="grid gap-2 text-sm">
						{recentGames.map((game) => (
							<li key={game.id}>
								<button
									onClick={() => openGame(game.id)}
									className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/[0.03] px-4 py-2.5 text-left transition hover:border-[color:var(--accent)]/40 ${
										view?.meta.id === game.id ? 'border-[color:var(--accent)]/50' : 'border-neutral-800'
									}`}
								>
									<span className="font-semibold text-neutral-100">
										#{game.id} · {game.missionName || '—'} · E{game.episodeNumber}
									</span>
									<span className="flex items-center gap-3 text-xs font-semibold text-neutral-500">
										<span
											className={`inline-flex items-center rounded-full border px-3 py-0.5 uppercase tracking-[0.15em] ${
												game.status === 'published'
													? 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
													: 'border-neutral-700 text-neutral-400'
											}`}
										>
											{game.status}
										</span>
										{game.playedAt && <span>{game.playedAt.slice(0, 16)}</span>}
									</span>
								</button>
							</li>
						))}
					</ul>
					{hasMoreGames && (
						<AdminButton variant="secondary" onClick={() => void loadMoreGames()} disabled={busy}>
							{t('adminLoadMore')}
						</AdminButton>
					)}
				</div>
			</AdminSurface>

			<div ref={detailRef} className="scroll-mt-24">
				{view && (
					<GameDetail
						view={view}
						busy={busy}
						onSaveMapping={onSaveMapping}
						onPublish={onPublish}
						onUnpublish={onUnpublish}
						onDeleteDraft={onDeleteDraft}
					/>
				)}
			</div>
		</section>
	);
}

function GameDetail({
	view,
	busy,
	onSaveMapping,
	onPublish,
	onUnpublish,
	onDeleteDraft,
}: {
	view: GameStatsAdminView;
	busy: boolean;
	onSaveMapping: (mapping: StatsMapping) => Promise<boolean>;
	onPublish: () => void;
	onUnpublish: () => void;
	onDeleteDraft: () => void;
}) {
	const t = useTranslations('stats');

	const [guidUnit, setGuidUnit] = useState<Record<string, number | null>>({});
	const [winner, setWinner] = useState('');
	const [commanders, setCommanders] = useState<Record<string, number | ''>>({});
	const [onlyUnmatched, setOnlyUnmatched] = useState(false);

	useEffect(() => {
		setGuidUnit(view.mapping.guidUnit);
		setWinner(view.mapping.winner);
		const byFaction: Record<string, number | ''> = {};
		for (const faction of view.factions) {
			byFaction[faction] = view.mapping.commanders.find((c) => c.faction === faction)?.unitId ?? '';
		}
		setCommanders(byFaction);
	}, [view]);

	const currentMapping = useCallback(
		(): StatsMapping => ({
			guidUnit,
			winner,
			commanders: Object.entries(commanders)
				.filter(([, unitId]) => unitId !== '')
				.map(([faction, unitId]) => ({ faction, unitId: Number(unitId) })),
		}),
		[guidUnit, winner, commanders]
	);

	// Publish computes from the SAVED mapping — publishing while dirty must save first.
	const dirty = useMemo(
		() => mappingFingerprint(currentMapping()) !== mappingFingerprint(view.mapping),
		[currentMapping, view.mapping]
	);

	async function publishSaved() {
		if (dirty) {
			const saved = await onSaveMapping(currentMapping());
			if (!saved) return;
		}
		onPublish();
	}

	const needsAttention = useCallback(
		(player: PlayerMappingPreview) => (guidUnit[player.guid] ?? null) === null && player.matchedUnitId === null,
		[guidUnit]
	);
	const attentionCount = view.players.filter(needsAttention).length;
	const displayedPlayers = useMemo(() => {
		const players = onlyUnmatched ? view.players.filter(needsAttention) : view.players;
		return players.slice().sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.name.localeCompare(b.name));
	}, [view.players, onlyUnmatched, needsAttention]);

	const unitOptions = view.allUnits;
	const { sort: previewSort, toggle: togglePreviewSort } = useSortState<PreviewSortKey>(
		{ key: 'side', dir: 'asc' },
		PREVIEW_DEFAULT_DIR
	);
	const previewRows = useMemo(
		() => sortRows(view.preview, previewSort, previewValueOf, (a, b) => b.finalPoints - a.finalPoints),
		[view.preview, previewSort]
	);

	return (
		<AdminSurface>
			<div className="grid gap-5">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-xl font-semibold tracking-tight text-neutral-50">
							#{view.meta.id} · {view.meta.missionName || '—'} · E{view.meta.episodeNumber}
						</h2>
						<span
							className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
								view.meta.status === 'published'
									? 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
									: 'border-neutral-700 text-neutral-400'
							}`}
						>
							{view.meta.status}
						</span>
					</div>
					<p className="text-sm text-neutral-400">
						{t('adminSnapshotMeta', { playedAt: view.meta.playedAt.slice(0, 16) || '—', unmatched: attentionCount })}
						{view.activeSeason ? ` · ${t('adminSeasonActive', { name: view.activeSeason.name })}` : ` · ${t('adminNoActiveSeason')}`}
					</p>
				</div>

				{/* Result */}
				<div className="grid gap-4 rounded-xl border border-neutral-800 bg-white/[0.03] p-4 sm:grid-cols-3">
					<label className="grid content-start gap-1.5">
						<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminWinner')}</span>
						<select value={winner} onChange={(e) => setWinner(e.target.value)} className={`${selectClass} h-11 px-3`}>
							<option value="">—</option>
							<option value="draw">{t('resultDrawShort')}</option>
							{view.factions.map((faction) => (
								<option key={faction} value={faction}>
									{faction}
								</option>
							))}
						</select>
					</label>
					{view.factions.map((faction) => (
						<label key={faction} className="grid content-start gap-1.5">
							<span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{t('adminCommander', { side: faction })}</span>
							<select
								value={commanders[faction] ?? ''}
								onChange={(e) => setCommanders({ ...commanders, [faction]: e.target.value === '' ? '' : Number(e.target.value) })}
								className={`${selectClass} h-11 px-3`}
							>
								<option value="">—</option>
								{unitOptions.map((unit) => (
									<option key={unit.unitId} value={unit.unitId}>
										[{unit.tag}] {unit.name}
									</option>
								))}
							</select>
						</label>
					))}
				</div>

				{/* Player mapping */}
				<div className="flex flex-wrap items-center gap-3">
					<label className="flex items-center gap-2 text-sm text-neutral-300">
						<input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} className="accent-[var(--accent)]" />
						{t('adminOnlyUnmatched')}
					</label>
					{attentionCount > 0 && (
						<span className="inline-flex items-center rounded-full border border-amber-700/50 bg-amber-950/40 px-3 py-0.5 text-xs font-semibold text-amber-300">
							{t('adminUnmatchedChip', { n: attentionCount })}
						</span>
					)}
				</div>
				<div className="max-h-[26rem] overflow-auto rounded-xl border border-neutral-800 [scrollbar-width:thin]">
					<table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm">
						<thead className="sticky top-0 z-10 bg-neutral-950">
							<tr>
								<th className={thText}>{t('adminPlayer')}</th>
								<th className={thText}>{t('adminSnapshotUnit')}</th>
								<th className={thText}>{t('adminMatched')}</th>
								<th className={thText}>{t('adminResolvedUnit')}</th>
							</tr>
						</thead>
						<tbody>
							{displayedPlayers.map((player) => (
								<tr key={player.guid} className={`transition ${needsAttention(player) ? 'bg-amber-950/20' : 'hover:bg-white/[0.03]'}`}>
									<td className={`${tdText} text-neutral-200`}>
										{player.name}
										{player.callsign && !player.name.toLowerCase().includes(player.callsign.toLowerCase()) ? (
											<span className="text-neutral-500"> ({player.callsign})</span>
										) : ''}
										{!player.participated && (
											<span className="ml-2 text-xs uppercase tracking-[0.15em] text-neutral-600">{t('adminSpectator')}</span>
										)}
									</td>
									<td className={`${tdText} text-neutral-400`}>{player.snapshotUnitTag || '—'}</td>
									<td className={`${tdText} text-neutral-400`}>
										{player.matchedCallsign
											? `${player.matchedCallsign}${player.matchedUnitTag ? ` [${player.matchedUnitTag}]` : ''}`
											: t('adminUnregistered')}
									</td>
									<td className={tdText}>
										{/* max-w beats the base w-full: without it the widest OPTION dictates the column width */}
										<select
											value={guidUnit[player.guid] ?? ''}
											onChange={(e) => setGuidUnit({ ...guidUnit, [player.guid]: e.target.value === '' ? null : Number(e.target.value) })}
											className={`${selectClass} max-w-52`}
										>
											<option value="">{t('adminNoUnit')}</option>
											{unitOptions.map((unit) => (
												<option key={unit.unitId} value={unit.unitId}>
													[{unit.tag}] {unit.name}
												</option>
											))}
										</select>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Preview */}
				<div className="overflow-x-auto rounded-xl border border-neutral-800">
					<table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
						<thead>
							<tr>
								<SortHeader label={t('colUnit')} sortKey="unit" sort={previewSort} onToggle={togglePreviewSort} numeric={false} />
								<SortHeader label={t('colSide')} sortKey="side" sort={previewSort} onToggle={togglePreviewSort} numeric={false} />
								<SortHeader label={t('colKills')} sortKey="kills" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colDeaths')} sortKey="deaths" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colTeamkills')} sortKey="teamkills" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colSurvivors')} sortKey="survivors" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colObjectives')} sortKey="objectives" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colParticipants')} sortKey="participants" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colOccupancy')} sortKey="occupancy" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colMultiplier')} sortKey="multiplier" sort={previewSort} onToggle={togglePreviewSort} />
								<SortHeader label={t('colFinal')} sortKey="final" sort={previewSort} onToggle={togglePreviewSort} />
							</tr>
						</thead>
						<tbody>
							{previewRows.map((row) => (
								<tr key={`${row.unitId}|${row.side}`} className="transition hover:bg-white/[0.03]">
									<td className={`${tdText} text-neutral-100`}>
										<div className="flex items-baseline gap-1.5">
											<span className="shrink-0 font-semibold text-[color:var(--accent)]">[{row.unitTag}]</span>
											<span className="max-w-44 truncate" title={row.unitName}>
												{row.unitName}
											</span>
											{row.isCommander && <span className="shrink-0 text-[color:var(--accent)]">★</span>}
										</div>
									</td>
									<td className={`${tdText} text-neutral-400`}>{row.side}</td>
									<td className={`${tdNum} text-neutral-200`}>{row.kills}</td>
									<td className={`${tdNum} text-neutral-400`}>{row.deaths}</td>
									<td className={`${tdNum} text-red-400`}>{row.teamkills}</td>
									<td className={`${tdNum} text-neutral-200`}>{row.survivors}</td>
									<td className={`${tdNum} text-neutral-200`}>{fmt1(row.objectivePoints)}</td>
									<td className={`${tdNum} text-neutral-200`}>{row.participants}</td>
									<td className={`${tdNum} text-neutral-400`}>{row.occupancyPct === null ? '—' : `${row.occupancyPct}%`}</td>
									<td className={`${tdNum} text-neutral-200`}>{fmtMult(row.multiplier)}</td>
									<td className={`${tdNum} font-semibold text-[color:var(--accent)]`}>{fmt1(row.finalPoints)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<AdminButton variant={dirty ? 'primary' : 'secondary'} onClick={() => void onSaveMapping(currentMapping())} disabled={busy || !dirty}>
						{t('adminSaveMapping')}
					</AdminButton>
					{view.meta.status === 'draft' ? (
						<>
							<AdminButton variant="primary" onClick={() => void publishSaved()} disabled={busy}>
								{t('adminPublishButton')}
							</AdminButton>
							<button
								onClick={onDeleteDraft}
								disabled={busy}
								className="inline-flex items-center rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
							>
								{t('adminDeleteDraft')}
							</button>
						</>
					) : (
						<AdminButton variant="secondary" onClick={onUnpublish} disabled={busy} className="text-red-300">
							{t('adminUnpublishButton')}
						</AdminButton>
					)}
					{dirty && <span className="text-xs font-semibold text-amber-300/90">{t('adminUnsavedHint')}</span>}
				</div>
			</div>
		</AdminSurface>
	);
}
