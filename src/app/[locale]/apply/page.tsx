import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApplyPage } from '@/features/apply/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserFlowRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from "@/features/users/useCases/getUserStatus";

export default async function ApplyRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

		const flowRedirect = getUserFlowRedirect(locale, status);
		if (flowRedirect && flowRedirect !== `/${locale}/apply`) redirect(flowRedirect);

	return <ApplyPage steamConnected={status.connected} locale={locale} />;
}
