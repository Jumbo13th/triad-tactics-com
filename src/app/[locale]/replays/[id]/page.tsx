import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { publicReplaysDeps } from '@/features/replays/deps';
import { getReplayForViewer } from '@/features/replays/useCases/viewReplays';
import { ReplayViewer } from '@/features/replays/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';

export const dynamic = 'force-dynamic';

export default async function ReplayRoutePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
	const { id } = await params;
	const gameId = Number(id);
	if (!Number.isInteger(gameId) || gameId <= 0) notFound();

	const cookieStore = await cookies();
	const status = getUserStatus(steamAuthDeps, cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null);
	const viewerIsAdmin = status.connected && status.accessLevel === 'admin';

	const game = getReplayForViewer(publicReplaysDeps, { gameId, viewerIsAdmin });
	if (!game) notFound();

	return <ReplayViewer game={game} />;
}
