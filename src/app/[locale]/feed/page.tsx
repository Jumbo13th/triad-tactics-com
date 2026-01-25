import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeedPage } from '@/features/feed/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';
import { getUserFlowRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';

export default async function FeedRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);

	const flowRedirect = getUserFlowRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	if (!status.connected || (status.accessLevel !== 'player' && status.accessLevel !== 'admin')) {
		redirect(`/${locale}`);
	}

	return <FeedPage />;
}
