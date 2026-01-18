import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ApplyPage from '@/features/apply/ui/ApplyPage';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';

export default async function ApplyRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);

	if (status.connected) {
		if (status.renameRequired && !status.hasPendingRenameRequest) {
			redirect(`/${locale}/rename`);
		}
	}

	return <ApplyPage />;
}
