'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

export type ScreenshotItem = {
  src: string;
  alt: string;
};

export default function ScreenshotStrip({ items }: { items: ScreenshotItem[] }) {
  const safeItems = useMemo(() => items.filter(Boolean), [items]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openIndex]);

  if (safeItems.length === 0) return null;

  const openItem = openIndex === null ? null : safeItems[openIndex];

  return (
    <>
      <div className="mt-5 grid grid-cols-3 gap-3 sm:mt-6 sm:gap-4">
        {safeItems.map((shot, idx) => (
          <button
            key={shot.src}
            type="button"
            onClick={() => setOpenIndex(idx)}
            className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
            aria-label={shot.alt}
            title={shot.alt}
          >
            <div className="relative aspect-video">
              <Image
                src={shot.src}
                alt={shot.alt}
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 30vw, 280px"
                quality={90}
                className="object-cover opacity-95 transition-opacity group-hover:opacity-100"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/20 group-hover:ring-[color:var(--accent)]/30" />
          </button>
        ))}
      </div>

      {openItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={openItem.alt}
          onClick={() => setOpenIndex(null)}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-lg shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video bg-black">
              <Image
                src={openItem.src}
                alt={openItem.alt}
                fill
                sizes="90vw"
                quality={95}
                className="object-contain"
                priority
              />
            </div>

            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950/80 text-neutral-200 backdrop-blur-sm hover:bg-neutral-900/80 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40"
              aria-label="Close"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M4.47 4.47a.75.75 0 0 1 1.06 0L10 8.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L11.06 10l4.47 4.47a.75.75 0 1 1-1.06 1.06L10 11.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L8.94 10 4.47 5.53a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
