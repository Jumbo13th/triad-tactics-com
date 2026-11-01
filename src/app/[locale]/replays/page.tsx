import { publicReplaysDeps } from '@/features/replays/deps';
import { replayListQuerySchema } from '@/features/replays/domain/requests';
import { searchPublishedReplays } from '@/features/replays/useCases/viewReplays';
import { ReplaysListPage } from '@/features/replays/ui/root';

export const dynamic = 'force-dynamic';

// Public, like the statistics: published replays are the games the community chose to show.
export default async function ReplaysRoutePage({
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { q, page } = replayListQuerySchema.parse(await searchParams);
	const result = searchPublishedReplays(publicReplaysDeps, { query: q, page });
	return <ReplaysListPage result={result} />;
}
