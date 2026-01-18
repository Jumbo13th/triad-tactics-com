import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import WelcomePage from '@/features/welcome/ui/WelcomePage';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getSteamStatus } from '@/features/steamAuth/useCases/getSteamStatus';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getSteamStatus(steamAuthDeps, sid);

	// If the user is logged in (Steam) but has NOT applied yet,
	// send them directly to the application form as the primary flow.
	if (status.connected) {
		// If an admin requested a rename and the user hasn't submitted a rename request yet,
		// block the site until they do so.
		if (status.renameRequired && !status.hasPendingRenameRequest) {
			redirect(`/${locale}/rename`);
		}

		if (!status.hasExisting) {
			redirect(`/${locale}/apply`);
		}
	}

	return <WelcomePage />;
}
