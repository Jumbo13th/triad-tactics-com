import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { isAppLocale, routing } from '@/i18n/routing';
import './globals.css';

export const metadata: Metadata = {
  title: 'Triad Tactics',
  description: 'Triad Tactics Gaming Server'
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localeRaw = await getLocale();
  const locale = typeof localeRaw === 'string' && isAppLocale(localeRaw) ? localeRaw : routing.defaultLocale;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-neutral-950 text-neutral-50 antialiased">
        {children}
      </body>
    </html>
  );
}
