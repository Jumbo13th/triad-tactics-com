import { useTranslations } from 'next-intl';
import { CommunityLinks, MediaStrip } from '@/features/welcome/ui/root';
import type { MediaStripItem } from '@/features/welcome/ui/MediaStrip';
import { getContentSettings } from '@/features/content/useCases/getContentSettings';
import { getContentSettingsDeps } from '@/features/content/deps';
import { UpcomingGamesWidget } from '@/features/content/ui/root';

export default function WelcomePage() {
  const tw = useTranslations('welcome');
  const content = getContentSettings(getContentSettingsDeps);
  const upcomingGames = content.upcomingGames;

  const screenshots: MediaStripItem[] = [
    { type: 'image', src: '/screenshots/01.jpg', alt: tw('gallery.items.1.alt') },
    { type: 'youtube', videoId: 'pPpXREbvmFw', alt: tw('gallery.items.2.videoAlt') },
    { type: 'image', src: '/screenshots/03.jpg', alt: tw('gallery.items.3.alt') }
  ];

  return (
    <section className="grid gap-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20 sm:p-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{tw('community.title')}</h2>
          <p className="text-sm text-neutral-300 sm:text-base">{tw('community.subtitle')}</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <CommunityLinks />
        </div>
      </div>
      {upcomingGames.enabled && upcomingGames.startsAt ? (
        <UpcomingGamesWidget startsAt={upcomingGames.startsAt} text={upcomingGames.text} />
      ) : null}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{tw('aboutTitle')}</h2>
        <p className="mt-4 text-neutral-300">{tw('aboutP1')}</p>

        <p className="mt-3 text-neutral-300">{tw('aboutP2')}</p>

        <h3 className="mt-6 text-sm font-semibold tracking-wide text-neutral-200">{tw('highlightsTitle')}</h3>
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

        <MediaStrip items={screenshots} />
      </div>
    </section>
  );
}
