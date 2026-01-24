import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isAppLocale } from './locales';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (typeof locale !== 'string' || !isAppLocale(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
