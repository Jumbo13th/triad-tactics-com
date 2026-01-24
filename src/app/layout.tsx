import type { Metadata } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import { getLocale } from 'next-intl/server';
import { isAppLocale, routing } from '@/i18n/routing';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const notoArabic = Noto_Sans_Arabic({ subsets: ['arabic'], display: 'swap' });

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

  const fontClassName = locale === 'ar' ? notoArabic.className : inter.className;

  return (
    <html lang={locale} dir={dir}>
      <body className={`min-h-screen bg-neutral-950 text-neutral-50 antialiased ${fontClassName}`}>
        {children}
      </body>
    </html>
  );
}
