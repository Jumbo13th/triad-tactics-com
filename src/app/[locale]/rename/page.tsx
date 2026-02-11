import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { RenamePage } from '@/features/rename/ui/root';
import { getUserStatus } from "@/features/users/useCases/getUserStatus";

export default async function RenameRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	if (!status.connected) {
		redirect(`/${locale}`);
	}

	// If no rename is required, there's nothing to do here.
	if (!status.renameRequired) {
		redirect(`/${locale}`);
	}

	return (
		<RenamePage
			locale={locale}
			callsign={status.currentCallsign}
			personaName={status.personaName}
			steamid64={status.steamid64}
			renameRequiredReason={status.renameRequiredReason}
			renameRequiredBySteamId64={status.renameRequiredBySteamId64}
			renameRequiredByCallsign={status.renameRequiredByCallsign}
			hasPendingRenameRequest={status.hasPendingRenameRequest}
		/>
	);
}
