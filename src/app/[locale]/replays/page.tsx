import { publicReplaysDeps } from '@/features/replays/deps';
import { replayListQuerySchema } from '@/features/replays/domain/requests';
import { searchPublishedReplays } from '@/features/replays/useCases/viewReplays';
import { ReplaysListPage } from '@/features/replays/ui/root';
import { defaultLocale, isAppLocale } from '@/i18n/locales';

export const dynamic = 'force-dynamic';

// Public, like the statistics: published replays are the games the community chose to show.
export default async function ReplaysRoutePage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const requested = (await params).locale;
	const locale = isAppLocale(requested) ? requested : defaultLocale;
	const { q, terrain, mission, from, to, sort, page } = replayListQuerySchema.parse(await searchParams);
	const result = searchPublishedReplays(publicReplaysDeps, { query: q, terrain, mission, from, to, sort, page, locale });
	return <ReplaysListPage result={result} />;
}
