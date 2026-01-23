export const appLocales = ['en', 'ru', 'uk', 'ar'] as const;
export type AppLocale = (typeof appLocales)[number];

export const defaultLocale: AppLocale = 'en';

export function isAppLocale(value: string): value is AppLocale {
	return (appLocales as readonly string[]).includes(value);
}
