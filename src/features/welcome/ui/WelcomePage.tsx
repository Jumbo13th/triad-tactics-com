import { useTranslations } from 'next-intl';
import { MediaStrip } from '@/features/welcome/ui/root';
import type { MediaStripItem } from '@/features/welcome/ui/MediaStrip';

export default function WelcomePage() {
  const tw = useTranslations('welcome');

  const screenshots: MediaStripItem[] = [
    { type: 'image', src: '/screenshots/01.jpg', alt: tw('gallery.items.1.alt') },
    { type: 'youtube', videoId: 'pPpXREbvmFw', alt: tw('gallery.items.2.videoAlt') },
    { type: 'image', src: '/screenshots/03.jpg', alt: tw('gallery.items.3.alt') }
  ];

  const communityLinks = [
    {
      href: 'https://t.me/triad_tactics',
      label: tw('community.telegramLabel'),
      accent: 'from-[#2AABEE]/15 via-transparent to-transparent',
      border: 'border-[#2AABEE]/50',
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-7 w-7 text-[#2AABEE]"
          fill="currentColor"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      )
    },
    {
      href: 'https://discord.gg/t8TK9Y2vsM',
      label: tw('community.discordLabel'),
      accent: 'from-[#5865F2]/15 via-transparent to-transparent',
      border: 'border-[#5865F2]/50',
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-7 w-7 text-[#5865F2]"
          fill="currentColor"
        >
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
        </svg>
      )
    }
  ];

  return (
    <section className="grid gap-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20 sm:p-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{tw('community.title')}</h2>
          <p className="text-sm text-neutral-300 sm:text-base">{tw('community.subtitle')}</p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {communityLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={`group relative overflow-hidden rounded-2xl border ${link.border} bg-gradient-to-br ${link.accent} px-4 py-3 transition duration-200 hover:border-neutral-400/70 hover:bg-neutral-900/60`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/80 p-2">
                    {link.icon}
                  </div>
                  <h4 className="text-base font-semibold text-neutral-50 sm:text-lg">{link.label}</h4>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-200 transition group-hover:border-neutral-400/80">
                  {tw('community.joinAction')}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
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
