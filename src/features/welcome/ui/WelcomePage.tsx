import { CommunityLinks, GettingStartedHero } from '@/features/welcome/ui/root';
import type { CurrentGameSummary } from '@/features/games/domain/types';
import type { StandingsRow } from '@/features/stats/domain/types';
import CurrentGameMissionCard from '@/features/games/ui/CurrentGameMissionCard';
import { TopUnitsWidget } from '@/features/stats/ui/root';

const GETTING_STARTED_VIDEO_ID = '6r89UBqFqwY';

export default function WelcomePage({
  currentGame,
  isConfirmedMember,
  showGuideBelowMission,
  topUnits = null
}: {
  currentGame: CurrentGameSummary | null;
  isConfirmedMember: boolean;
  showGuideBelowMission: boolean;
  // Season leaderboard teaser — shown to EVERY visitor, anonymous included.
  topUnits?: { seasonName: string; rows: StandingsRow[] } | null;
}) {
  const gameCard = currentGame ? <CurrentGameMissionCard current={currentGame} /> : null;
  const hero = <GettingStartedHero videoId={GETTING_STARTED_VIDEO_ID} compact={isConfirmedMember} />;
  const statsBlock =
    topUnits && topUnits.rows.length > 0 ? <TopUnitsWidget seasonName={topUnits.seasonName} rows={topUnits.rows} /> : null;

  return (
    <section className="grid gap-8">
      <div className="grid gap-3 lg:grid-cols-2">
        <CommunityLinks />
      </div>

      {showGuideBelowMission ? (
        <>
          {gameCard}
          {statsBlock}
          {hero}
        </>
      ) : (
        <>
          {hero}
          {gameCard}
          {statsBlock}
        </>
      )}
    </section>
  );
}
