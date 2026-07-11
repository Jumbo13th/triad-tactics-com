'use client';

import Image from 'next/image';
import { useEffect } from 'react';

type MediaItemBase = {
  alt: string;
};

export type MediaItem =
  | (MediaItemBase & {
      type: 'image';
      src: string;
    })
  | (MediaItemBase & {
      type: 'youtube';
      videoId: string;
    });

export default function MediaLightbox({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-lg shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video bg-black">
          {item.type === 'youtube' ? (
            <iframe
              src={`https://www.youtube.com/embed/${item.videoId}?rel=0&modestbranding=1`}
              title={item.alt}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <Image
              src={item.src}
              alt={item.alt}
              fill
              sizes="90vw"
              quality={95}
              className="object-contain"
              priority
            />
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
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
  );
}

export function YoutubePlayBadge({ className = 'h-12 w-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 68 48" className={`${className} drop-shadow-lg`} aria-hidden="true">
      <path
        d="M66.52 7.27a8 8 0 0 0-5.64-5.64C56.22 0 34 0 34 0S11.78 0 7.12 1.63a8 8 0 0 0-5.64 5.64C0 11.93 0 24 0 24s0 12.07 1.48 16.73a8 8 0 0 0 5.64 5.64C11.78 48 34 48 34 48s22.22 0 26.88-1.63a8 8 0 0 0 5.64-5.64C68 36.07 68 24 68 24s0-12.07-1.48-16.73Z"
        fill="#FF0000"
      />
      <path d="M45 24 27 14v20" fill="#FFFFFF" />
    </svg>
  );
}
