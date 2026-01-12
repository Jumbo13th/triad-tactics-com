import { useTranslations } from 'next-intl';
import Image from 'next/image';
import ApplicationForm from '@/features/apply/ui/ApplicationForm';
import LanguageSwitcher from '@/features/language/ui/LanguageSwitcher';
import SocialLinks from '@/features/social/ui/SocialLinks';
import { Link } from '@/i18n/routing';

export default function ApplyPage() {
  const t = useTranslations('app');
  const tf = useTranslations('form');
  const tw = useTranslations('welcome');

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 pt-6 pb-10 sm:pt-8 sm:pb-14">
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
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
                    <Link href="/" className="hover:text-[color:var(--accent)]">
                      {t('title')}
                    </Link>
                  </h1>
                  <Link
                    href="/"
                    className="text-sm font-medium text-neutral-300 hover:text-[color:var(--accent)]"
                  >
                    {tw('backToWelcome')}
                  </Link>
                </div>
                <div className="mt-3 h-px w-24 bg-[color:var(--accent)]/80" />
                <p className="mt-3 text-base text-neutral-300">{t('subtitle')}</p>
              </div>
            </div>
            <div className="pt-1 sm:shrink-0 sm:self-auto">
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">
              {tf('title')}
            </h2>
            <p className="mt-1 text-sm text-neutral-300">{tf('subtitle')}</p>
          </div>
          <ApplicationForm />
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
