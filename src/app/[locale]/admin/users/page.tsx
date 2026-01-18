import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminUsersPage from '@/features/admin/ui/AdminUsersPage';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';

export default async function AdminUsersGatePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);

	if (status.connected) {
		if (status.renameRequired && !status.hasPendingRenameRequest) {
			redirect(`/${locale}/rename`);
		}
		if (!status.hasExisting) {
			redirect(`/${locale}/apply`);
		}
	}

	return <AdminUsersPage />;
}
