import { redirect } from 'next/navigation';
import { statsDeps } from '@/features/stats/deps';
import { getGameStatsView } from '@/features/stats/useCases/getGameStatsView';
import { deriveSideColors } from '@/features/stats/useCases/deriveSideColors';
import { GameStatsView } from '@/features/stats/ui/root';
import { rotationDeps } from '@/features/rotation/deps';
import { getRotationMap } from '@/features/rotation/useCases/getRotationMap';

export default async function GameStatsRoutePage({
	params,
}: {
	params: Promise<{ locale: string; gameStatsId: string }>;
}) {
	const { locale, gameStatsId } = await params;

	const view = getGameStatsView(statsDeps, { gameStatsId: Number(gameStatsId) });
	if (!view) redirect(`/${locale}/stats`);

	const rotationSides = getRotationMap(rotationDeps);
	const colorByUnit: Record<number, string> = {};
	for (const [unitId, side] of Object.entries(rotationSides)) colorByUnit[Number(unitId)] = side.sideColor;
	const sideColors = deriveSideColors(view.scores, view.factions, colorByUnit);

	return (
		<GameStatsView
			meta={view.meta}
			scores={view.scores}
			timeline={view.timeline}
			factions={view.factions}
			sideColors={sideColors}
		/>
	);
}
