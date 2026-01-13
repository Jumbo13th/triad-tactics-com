import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminPage from '@/features/admin/ui/AdminPage';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';

export default async function AdminGatePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);

	// If the user is logged in (Steam) but has NOT applied yet,
	// keep them on the application flow.
	if (status.connected && !status.hasExisting) {
		redirect(`/${locale}/apply`);
	}

	return <AdminPage />;
}
