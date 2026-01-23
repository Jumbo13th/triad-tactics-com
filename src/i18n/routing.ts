import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { appLocales, defaultLocale, isAppLocale } from './locales';

export const routing = defineRouting({
  locales: appLocales,
  defaultLocale
});

export type AppLocale = (typeof routing.locales)[number];

export { isAppLocale };

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
