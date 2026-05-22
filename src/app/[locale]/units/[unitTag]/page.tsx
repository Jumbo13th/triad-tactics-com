import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnitDetailPage } from '@/features/units/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { unitDeps } from '@/features/units/deps';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationSideForUnit } from '@/features/rotation/useCases/getRotationSideForUnit';

export default async function UnitDetailRoutePage({ params }: { params: Promise<{ locale: string; unitTag: string }> }) {
	const { locale, unitTag } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	const id = unitDeps.repo.getUnitIdByTag(unitTag);
	if (!id) redirect(`/${locale}/units`);

	const rotationSide = getRotationSideForUnit(rotationDeps, id);

	return <UnitDetailPage unitId={id} rotationSide={rotationSide} />;
}
