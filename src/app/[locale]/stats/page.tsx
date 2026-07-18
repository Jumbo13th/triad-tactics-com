import { statsDeps } from '@/features/stats/deps';
import { getSeasonStandings } from '@/features/stats/useCases/getSeasonStandings';
import { getSeasonRace } from '@/features/stats/useCases/getSeasonRace';
import { getStatsLanding } from '@/features/stats/useCases/getStatsLanding';
import { listSeasons } from '@/features/stats/useCases/seasons';
import { StatsSection } from '@/features/stats/ui/root';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationMap } from '@/features/rotation/useCases/getRotationMap';

// Public — the statistics section is deliberately visible to anonymous
// visitors: the season table is the community's shop window.
export default async function StatsRoutePage({
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ season?: string; page?: string }>;
}) {
	const { season: seasonParam, page: pageParam } = await searchParams;

	const requestedSeasonId = seasonParam !== undefined ? Number(seasonParam) : undefined;
	const standings = getSeasonStandings(statsDeps, {
		seasonId: Number.isFinite(requestedSeasonId) ? requestedSeasonId : undefined,
	});
	const seasonId = standings.season ? standings.season.id : null;

	const rotationSides = getRotationMap(rotationDeps);
	const page = Math.max(1, Number(pageParam) || 1);
	const landing = getStatsLanding(statsDeps, { seasonId, rotationSides, page });

	return (
		<StatsSection
			season={standings.season}
			seasons={listSeasons(statsDeps).seasons}
			rows={standings.rows}
			missionGroups={landing.missionGroups}
			gamesPage={landing.page}
			gamesTotalPages={landing.totalPages}
			rotationSides={rotationSides}
			race={getSeasonRace(statsDeps, { seasonId })}
			sideWins={landing.sideWins}
		/>
	);
}
