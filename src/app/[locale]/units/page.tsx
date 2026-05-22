import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnitsListPage } from '@/features/units/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationUseCase } from '@/features/rotation/useCases/getRotation';

export default async function UnitsRoutePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	const rotation = getRotationUseCase(rotationDeps).json;
	const rotationMap = new Map<number, { sideName: string; sideColor: string }>();
	for (const u of rotation.sideA) rotationMap.set(u.unitId, { sideName: rotation.config.sideAName, sideColor: rotation.config.sideAColor });
	for (const u of rotation.sideB) rotationMap.set(u.unitId, { sideName: rotation.config.sideBName, sideColor: rotation.config.sideBColor });

	return <UnitsListPage rotationMap={Object.fromEntries(rotationMap)} />;
}
