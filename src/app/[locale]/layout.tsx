import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isAppLocale, routing } from '@/i18n/routing';
import { SiteFooter, SiteFrame, SiteHeader } from '@/features/appShell/ui/root';
import { BanNotice } from '@/features/sanctions/ui/root';

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
        <SiteFrame
          header={
            <SiteHeader
              homeAriaLabel={t('title')}
              title={t('title')}
              subtitle={t('subtitle')}
              primaryAction={{ href: '/apply', label: tw('applyButtonShort') }}
            />
          }
          footer={<SiteFooter />}
        >
          <BanNotice>{children}</BanNotice>
        </SiteFrame>
      </main>
    </NextIntlClientProvider>
  );
}
