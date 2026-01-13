import { useTranslations } from 'next-intl';
import SocialLinks from '@/features/social/ui/SocialLinks';
import SiteHeader from '@/features/appShell/ui/SiteHeader';
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
      <div className="mx-auto max-w-4xl px-4 pt-6 pb-10 sm:pt-8 sm:pb-14">
        <SiteHeader
          homeAriaLabel={t('title')}
          title={t('title')}
          subtitle={t('subtitle')}
          primaryAction={{ href: '/apply', label: tw('applyButtonShort') }}
        />

        <section className="mt-6 grid gap-8">
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
