import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isAppLocale, routing } from '@/i18n/routing';
import { SiteFooter, SiteHeader } from '@/features/appShell/ui/root';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!isAppLocale(locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: 'app' });
  const tw = await getTranslations({ locale, namespace: 'welcome' });
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen bg-neutral-950" dir={dir} lang={locale}>
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 pt-6 pb-2 sm:pt-8 sm:pb-6">
          <SiteHeader
            homeAriaLabel={t('title')}
            title={t('title')}
            subtitle={t('subtitle')}
            primaryAction={{ href: '/apply', label: tw('applyButtonShort') }}
          />

          <div className="mt-6 flex-1">{children}</div>

          <SiteFooter />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
