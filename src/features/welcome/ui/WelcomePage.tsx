import { CommunityLinks, GettingStartedHero } from '@/features/welcome/ui/root';
import type { CurrentGameSummary } from '@/features/games/domain/types';
import CurrentGameMissionCard from '@/features/games/ui/CurrentGameMissionCard';

const GETTING_STARTED_VIDEO_ID = '6r89UBqFqwY';

export default function WelcomePage({
  currentGame,
  isConfirmedMember,
  showGuideBelowMission
}: {
  currentGame: CurrentGameSummary | null;
  isConfirmedMember: boolean;
  showGuideBelowMission: boolean;
}) {
  const gameCard = currentGame ? <CurrentGameMissionCard current={currentGame} /> : null;
  const hero = <GettingStartedHero videoId={GETTING_STARTED_VIDEO_ID} compact={isConfirmedMember} />;

  return (
    <section className="grid gap-8">
      <div className="grid gap-3 lg:grid-cols-2">
        <CommunityLinks />
      </div>

      {showGuideBelowMission ? (
        <>
          {gameCard}
          {hero}
        </>
      ) : (
        <>
          {hero}
          {gameCard}
        </>
      )}
    </section>
  );
}
