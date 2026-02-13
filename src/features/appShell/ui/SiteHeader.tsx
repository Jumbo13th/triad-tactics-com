import Image from 'next/image';
import { SteamAuthControls } from '@/features/steamAuth/ui/root';
import { Link } from '@/i18n/routing';
import SiteNavBar from './SiteNavBar';
import PrimaryActionButton from "@/features/appShell/ui/PrimaryActionButton";

type SiteHeaderProps = {
  homeAriaLabel: string;
  title: string;
  subtitle: string;
  primaryAction?: { href: string; label: string };
};

export default function SiteHeader({ homeAriaLabel, title, subtitle, primaryAction }: SiteHeaderProps) {
  return (
    <header>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-950/65 via-neutral-950/40 to-neutral-900/30 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.6)] backdrop-blur-md sm:p-6">
        <div
          className="pointer-events-none absolute -top-28 -right-28 h-72 w-72 rounded-full bg-[color:var(--accent)]/18 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-36 h-96 w-96 rounded-full bg-[color:var(--accent)]/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Link href="/" aria-label={homeAriaLabel} className="shrink-0">
              <Image src="/triad-logo.png" alt="Triad Tactics" width={68} height={68} priority />
            </Link>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="inline-block min-w-0">
                  <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
                    <Link href="/" className="block hover:text-[color:var(--accent)]">
                      {title}
                    </Link>
                  </h1>

                  <div
                    className="mt-2 h-1 w-full rounded-full bg-gradient-to-r from-[color:var(--accent)] via-[color:var(--accent)] to-transparent"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <p className="mt-1.5 text-base text-neutral-200/90">{subtitle}</p>

              <PrimaryActionButton primaryAction={primaryAction} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <SteamAuthControls />
          </div>
        </div>
      </div>

      <SiteNavBar />
    </header>
  );
}
