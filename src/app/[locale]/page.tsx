import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentGameDeps, getIsEstablishedPlayerDeps } from '@/features/games/deps';
import { getCurrentGame } from '@/features/games/useCases/getCurrentGame';
import { getIsEstablishedPlayer } from '@/features/games/useCases/getIsEstablishedPlayer';
import { statsDeps } from '@/features/stats/deps';
import { getSeasonStandings } from '@/features/stats/useCases/getSeasonStandings';
import { getStatsVisibility } from '@/features/stats/useCases/statsVisibility';
import { WelcomePage } from '@/features/welcome/ui/root';
import { STEAM_SESSION_COOKIE } from '@/features/steamAuth/sessionCookie';
import { steamAuthDeps } from '@/features/steamAuth/deps';
import { getUserFlowRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import { getUserStatus } from '@/features/users/useCases/getUserStatus';
import { isConfirmedByAccessLevel } from '@/features/users/domain/api';
import { appLocales } from '@/i18n/locales';

const SITE_URL = 'https://triad-tactics.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;
	const tw = await getTranslations({ locale, namespace: 'welcome' });

	const title = tw('aboutTitle');
	const description = `${tw('aboutP1')} ${tw('aboutP2')}`;

	return {
		title,
		description,
		alternates: {
			canonical: `${SITE_URL}/${locale}`,
			languages: Object.fromEntries(appLocales.map((l) => [l, `${SITE_URL}/${l}`]))
		},
		openGraph: {
			title,
			description: tw('aboutP1'),
			url: `${SITE_URL}/${locale}`,
			siteName: 'Triad Tactics',
			type: 'website',
			images: [{ url: `${SITE_URL}/screenshots/01.jpg` }]
		}
	};
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const cookieStore = await cookies();
	const sid = cookieStore.get(STEAM_SESSION_COOKIE)?.value ?? null;
	const status = getUserStatus(steamAuthDeps, sid);

	const flowRedirect = getUserFlowRedirect(locale, status);
	if (flowRedirect) redirect(flowRedirect);

	let currentGame: ReturnType<typeof getCurrentGame> = null;
	try {
		currentGame = getCurrentGame(getCurrentGameDeps);
	} catch {
		currentGame = null;
	}

	// Season leaderboard teaser — public by design (visible to anonymous
	// visitors); the widget hides itself when nothing is published yet.
	// The admin "hide statistics" toggle removes it for everyone, admins too.
	let topUnits: { seasonName: string; rows: ReturnType<typeof getSeasonStandings>['rows'] } | null = null;
	try {
		if (!getStatsVisibility(statsDeps).hidden) {
			const standings = getSeasonStandings(statsDeps);
			topUnits = { seasonName: standings.season?.name ?? '', rows: standings.rows.slice(0, 5) };
		}
	} catch {
		topUnits = null;
	}

	const isConfirmedMember = status.connected && isConfirmedByAccessLevel(status.accessLevel);

	const showGuideBelowMission =
		status.connected && isConfirmedMember && getIsEstablishedPlayer(getIsEstablishedPlayerDeps, status.steamid64);

	const tw = await getTranslations({ locale, namespace: 'welcome' });
	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Triad Tactics',
		url: `${SITE_URL}/${locale}`,
		logo: `${SITE_URL}/triad-logo.png`,
		description: `${tw('aboutP1')} ${tw('aboutP2')} ${tw('disclaimerText')}`,
		knowsAbout: [tw('highlights.1'), tw('highlights.2'), tw('highlights.3')],
		sameAs: ['https://t.me/triad_tactics', 'https://discord.gg/t8TK9Y2vsM']
	};

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
			/>
			<WelcomePage
				currentGame={currentGame}
				isConfirmedMember={isConfirmedMember}
				showGuideBelowMission={showGuideBelowMission}
				topUnits={topUnits}
			/>
		</>
	);
}
