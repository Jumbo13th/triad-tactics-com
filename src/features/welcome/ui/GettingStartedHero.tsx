'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import MediaLightbox, { YoutubePlayBadge } from '@/features/welcome/ui/MediaLightbox';

export default function GettingStartedHero({ videoId, compact = false }: { videoId: string; compact?: boolean }) {
  const tw = useTranslations('welcome');
  const [open, setOpen] = useState(false);

  const videoAlt = tw('hero.videoAlt');
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  const lightbox = (
    <MediaLightbox
      item={open ? { type: 'youtube', videoId, alt: videoAlt } : null}
      onClose={() => setOpen(false)}
    />
  );

  if (compact) {
    return (
      <>
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20 sm:flex-row sm:items-center sm:p-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative w-full shrink-0 overflow-hidden rounded-xl border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40 sm:w-44"
            aria-label={videoAlt}
            title={videoAlt}
          >
            <div className="relative aspect-video">
              <Image
                src={thumbnail}
                alt={videoAlt}
                fill
                sizes="(max-width: 640px) 100vw, 176px"
                quality={90}
                className="object-cover opacity-95 transition-opacity group-hover:opacity-100"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <YoutubePlayBadge className="h-8 w-11" />
              </div>
            </div>
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight text-neutral-50">{tw('hero.title')}</h2>
            <p className="mt-1 text-sm text-neutral-400">{tw('hero.subtitle')}</p>
          </div>

          <Link
            href="/guide"
            className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900/70 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-400/70 hover:bg-neutral-900"
          >
            {tw('hero.readGuide')}
          </Link>
        </div>
        {lightbox}
      </>
    );
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-[color:var(--accent)]/30 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-8">
        <div className="pointer-events-none absolute -top-24 right-6 h-56 w-56 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl" aria-hidden="true" />

        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-10">
          <div className="grid gap-4">
            <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
              {tw('hero.eyebrow')}
            </span>

            <h2 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">{tw('hero.title')}</h2>

            <p className="max-w-xl text-neutral-300">{tw('hero.subtitle')}</p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--accent)] px-5 py-3 text-base font-semibold tracking-wide text-neutral-950 shadow-[0_18px_45px_rgba(0,0,0,0.6)] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
                </svg>
                {tw('hero.watchVideo')}
              </button>

              <Link
                href="/guide"
                className="inline-flex items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900/70 px-5 py-3 text-base font-semibold text-neutral-200 transition hover:border-neutral-400/70 hover:bg-neutral-900"
              >
                {tw('hero.readGuide')}
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            aria-label={videoAlt}
            title={videoAlt}
          >
            <div className="relative aspect-video">
              <Image
                src={thumbnail}
                alt={videoAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 480px"
                quality={90}
                priority
                className="object-cover opacity-95 transition duration-200 group-hover:scale-[1.02] group-hover:opacity-100"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <YoutubePlayBadge className="h-14 w-20" />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/20 group-hover:ring-[color:var(--accent)]/30" />
          </button>
        </div>
      </section>
      {lightbox}
    </>
  );
}
