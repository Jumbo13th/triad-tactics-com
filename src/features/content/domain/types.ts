import type { AppLocale } from '@/i18n/locales';

export type UpcomingGamesContent = {
	enabled: boolean;
	startsAt: string | null;
	text: Record<AppLocale, string>;
};

export type ContentSettings = {
	upcomingGames: UpcomingGamesContent;
};
