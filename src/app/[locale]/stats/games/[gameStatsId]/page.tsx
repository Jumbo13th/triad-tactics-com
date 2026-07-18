import { redirect } from 'next/navigation';
import { statsDeps } from '@/features/stats/deps';
import { getGameStatsView } from '@/features/stats/useCases/getGameStatsView';
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
	const sideColors: Record<string, string> = {};
	for (const faction of view.factions) {
		const tally = new Map<string, number>();
		for (const score of view.scores) {
			if (score.side !== faction) continue;
			const rotation = rotationSides[score.unitId];
			if (rotation) tally.set(rotation.sideColor, (tally.get(rotation.sideColor) ?? 0) + 1);
		}
		let best = 0;
		for (const [color, count] of tally) {
			if (count > best) {
				best = count;
				sideColors[faction] = color;
			}
		}
	}

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
