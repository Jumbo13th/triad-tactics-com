import { useTranslations } from 'next-intl';
import Image from 'next/image';
import LanguageSwitcher from '@/features/language/ui/LanguageSwitcher';
import SocialLinks from '@/features/social/ui/SocialLinks';
import { Link } from '@/i18n/routing';
import ScreenshotStrip from '@/features/welcome/ui/ScreenshotStrip';

export default function WelcomePage() {
  const t = useTranslations('app');
  const tw = useTranslations('welcome');

  const screenshots = [
    { src: '/screenshots/01.jpg', alt: tw('gallery.items.1.alt') },
    { src: '/screenshots/02.jpg', alt: tw('gallery.items.2.alt') },
    { src: '/screenshots/03.jpg', alt: tw('gallery.items.3.alt') }
  ];

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex min-w-0 items-start gap-4">
              <Link href="/" aria-label={t('title')} className="shrink-0">
                <Image
                  src="/triad-logo.png"
                  alt="Triad Tactics"
                  width={80}
                  height={80}
                  priority
                />
              </Link>
              <div className="min-w-0 max-w-2xl">
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
                  <Link href="/" className="hover:text-[color:var(--accent)]">
                    {t('title')}
                  </Link>
                </h1>
                <div className="mt-3 h-px w-24 bg-[color:var(--accent)]/80" />
                <p className="mt-3 text-base text-neutral-300">{t('subtitle')}</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/apply"
                    className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-6 py-3.5 text-base font-semibold tracking-wide text-neutral-950 shadow-lg shadow-black/40 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
                  >
                    {tw('applyButtonShort')}
                  </Link>
                </div>
              </div>
            </div>
            <div className="pt-1 sm:shrink-0 sm:self-auto">
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <section className="mt-10 grid gap-8">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
              {tw('aboutTitle')}
            </h2>
            <p className="mt-4 text-neutral-300">{tw('aboutP1')}</p>

            <p className="mt-3 text-neutral-300">{tw('aboutP2')}</p>

            <h3 className="mt-6 text-sm font-semibold tracking-wide text-neutral-200">
              {tw('highlightsTitle')}
            </h3>
            <ul className="mt-3 grid gap-2 text-sm text-neutral-300">
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                <span>{tw('highlights.1')}</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                <span>{tw('highlights.2')}</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
                <span>{tw('highlights.3')}</span>
              </li>
            </ul>

            <div className="mt-6 border-t border-neutral-900 pt-5">
              <h3 className="text-sm font-semibold text-neutral-200">{tw('disclaimerTitle')}</h3>
              <p className="mt-2 text-sm text-neutral-300">{tw('disclaimerText')}</p>
            </div>

            <ScreenshotStrip items={screenshots} />
          </div>
        </section>

        <footer className="mt-10 border-t border-neutral-900 pt-6 text-sm text-neutral-500">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; 2026 Triad Tactics</p>
            <SocialLinks />
          </div>
        </footer>
      </div>
    </main>
  );
}
