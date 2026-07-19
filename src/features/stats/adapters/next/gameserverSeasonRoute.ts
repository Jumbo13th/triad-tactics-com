import { NextRequest, NextResponse } from 'next/server';
import { isGameserverAuthorized } from '@/features/gameserver/adapters/next/gameserverAuth';
import { errorToLogObject, logger } from '@/platform/logger';
import { statsDeps } from '../../deps';
import { getSeasonStandings } from '../../useCases/getSeasonStandings';

// Response shape is a CONTRACT with the game's LL_StatsSeasonResponse structs:
// {"season":{"name"},"standings":[{tag,name,rank,score,rawPoints,games,wins,
// commandWins,kills,deaths,teamkills,avgPlayers}]}. The game skips unknown
// keys, so adding fields is compatible both ways.
// Capped — the payload is re-broadcast to every game client.
const MAX_STANDINGS_ROWS = 100;

export async function getGameserverSeasonRoute(request: NextRequest): Promise<NextResponse> {
	try {
		if (!isGameserverAuthorized(request)) {
			return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
		}

		const standings = getSeasonStandings(statsDeps);

		return NextResponse.json({
			season: { name: standings.season?.name ?? '' },
			standings: standings.rows.slice(0, MAX_STANDINGS_ROWS).map((row) => ({
				tag: row.unitTag,
				name: row.unitName,
				rank: row.rank,
				score: row.balanced,
				rawPoints: row.rawPoints,
				games: row.games,
				wins: row.wins,
				commandWins: row.commandWins,
				kills: row.kills,
				deaths: row.deaths,
				teamkills: row.teamkills,
				avgPlayers: row.avgParticipants,
			})),
		});
	} catch (error: unknown) {
		logger.error({ ...errorToLogObject(error) }, 'gameserver_season_lookup_failed');
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
