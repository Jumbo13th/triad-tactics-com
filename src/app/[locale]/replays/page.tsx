import { publicReplaysDeps } from '@/features/replays/deps';
import { listPublishedReplays } from '@/features/replays/useCases/viewReplays';
import { ReplaysListPage } from '@/features/replays/ui/root';

export const dynamic = 'force-dynamic';

// Public, like the statistics: published replays are the games the community chose to show.
export default async function ReplaysRoutePage() {
	const replays = listPublishedReplays(publicReplaysDeps, { limit: 200, offset: 0 });
	return <ReplaysListPage replays={replays} />;
}
