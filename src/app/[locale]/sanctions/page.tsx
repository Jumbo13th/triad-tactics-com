import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SanctionsPage } from '@/features/sanctions/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from "@/features/users/useCases/getUserStatus";

export default async function SanctionsGatePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);
	if (!status.connected) redirect(`/${locale}/apply`);

	return <SanctionsPage />;
}
