import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnitDetailPage } from '@/features/units/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getProtectedPageRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { unitDeps } from '@/features/units/deps';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationUseCase } from '@/features/rotation/useCases/getRotation';

export default async function UnitDetailRoutePage({ params }: { params: Promise<{ locale: string; unitTag: string }> }) {
	const { locale, unitTag } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getProtectedPageRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	const id = unitDeps.repo.getUnitIdByTag(unitTag);
	if (!id) redirect(`/${locale}/units`);

	const rotation = getRotationUseCase(rotationDeps).json;
	const allUnits = [...rotation.sideA, ...rotation.sideB];
	const match = allUnits.find(u => u.unitId === id);
	const rotationSide = match
		? {
			sideName: match.side === 'a' ? rotation.config.sideAName : rotation.config.sideBName,
			sideColor: match.side === 'a' ? rotation.config.sideAColor : rotation.config.sideBColor,
		}
		: null;

	return <UnitDetailPage unitId={id} rotationSide={rotationSide} />;
}
