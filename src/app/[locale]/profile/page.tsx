import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ProfilePage } from '@/features/profile/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserFlowRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';

export default async function ProfileRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getUserFlowRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	if (!status.connected || (status.accessLevel !== 'player' && status.accessLevel !== 'admin')) {
		redirect(`/${locale}`);
	}

	return <ProfilePage />;
};
