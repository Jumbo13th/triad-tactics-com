import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnitDetailPage, type UnitDetailInitialData } from '@/features/units/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamIdentity } from '@/features/steamAuth/useCases/getSteamIdentity';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { isAdminSteamId } from '@/platform/admin';
import { unitDeps } from '@/features/units/deps';
import { getUnit } from '@/features/units/useCases/getUnit';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationSideForUnit } from '@/features/rotation/useCases/getRotationSideForUnit';
import { statsDeps } from '@/features/stats/deps';
import { getUnitHistory } from '@/features/stats/useCases/getUnitHistory';
import { getSeasonStandings } from '@/features/stats/useCases/getSeasonStandings';
import { getSeasonRace } from '@/features/stats/useCases/getSeasonRace';
import { UnitStatsHistory } from '@/features/stats/ui/root';

export default async function UnitDetailRoutePage({ params }: { params: Promise<{ locale: string; unitTag: string }> }) {
	const { locale, unitTag } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	const id = unitDeps.repo.getUnitIdByTag(unitTag);
	if (!id) redirect(`/${locale}/units`);

	const rotationSide = getRotationSideForUnit(rotationDeps, id);

	// Server-render the unit detail (same payload as GET /api/units/[id]) so
	// members are in the initial HTML and #stats anchor navigation lands
	// without the content above it shifting.
	const identity = getSteamIdentity(steamAuthDeps, sid);
	const viewerSteamId64 = identity.connected ? identity.steamid64 : null;
	const detail = getUnit(unitDeps, {
		unitId: id,
		viewerSteamId64,
		isAdmin: viewerSteamId64 ? isAdminSteamId(viewerSteamId64) : false,
	});
	const initialData: UnitDetailInitialData | null = detail.ok ? detail.json : null;

	// The unit's full published statistics live here under #stats — /stats
	// links unit tags to /units/<tag>#stats. The unit is the stats entity:
	// rows were frozen at publish, membership changes don't rewrite them.
	const statsEntries = getUnitHistory(statsDeps, { unitId: id });

	// Current-season place, shown as "rank/total" among units with published games.
	const standings = getSeasonStandings(statsDeps);
	const standingsRow = standings.rows.find((row) => row.unitId === id);
	const seasonRank = standingsRow ? { rank: standingsRow.rank, total: standings.rows.length } : null;

	// Rank after each game, for the season-position chart.
	const race = getSeasonRace(statsDeps, { seasonId: standings.season ? standings.season.id : null });
	const raceSeries = race.series.find((s) => s.unitId === id);
	const rankSeries = raceSeries ? { games: race.games, ranks: raceSeries.ranks, totalUnits: race.series.length } : null;

	return (
		<>
			<UnitDetailPage unitId={id} rotationSide={rotationSide} initialData={initialData} />
			{statsEntries.length > 0 && (
				<div className="mt-8">
					<UnitStatsHistory entries={statsEntries} seasonRank={seasonRank} rankSeries={rankSeries} />
				</div>
			)}
		</>
	);
}
