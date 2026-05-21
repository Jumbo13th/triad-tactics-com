import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { ArmaIdPage } from '@/features/armaId/ui/root';

export default async function ArmaIdRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect && flowRedirect !== `/${locale}/arma-id`) redirect(flowRedirect);
	if (!status.connected) redirect(`/${locale}/apply`);

	// If ARMA GUID is already set, nothing to do here.
	if (!status.armaGuidRequired) {
		redirect(`/${locale}`);
	}

	return (
		<ArmaIdPage
			locale={locale}
			callsign={status.currentCallsign}
			personaName={status.personaName}
			steamid64={status.steamid64}
		/>
	);
}
