import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import GamesHubPage from '@/features/games/ui/GamesHubPage';
import { getGameArchiveSummariesDeps, getCurrentGameDeps } from '@/features/games/deps';
import { getGameArchiveSummaries } from '@/features/games/useCases/getGameArchiveSummaries';
import { getCurrentGame } from '@/features/games/useCases/getCurrentGame';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationUseCase } from '@/features/rotation/useCases/getRotation';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';

export default async function GamesRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	const current = getCurrentGame(getCurrentGameDeps);
	const archive = getGameArchiveSummaries(getGameArchiveSummariesDeps);
	if (!archive.ok) {
		throw new Error('games_archive_load_failed');
	}

	const rotation = getRotationUseCase(rotationDeps).json;

	return <GamesHubPage current={current} archive={archive.archive} rotation={rotation} />;
}
