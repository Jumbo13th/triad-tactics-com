import { useTranslations } from 'next-intl';
import ApplicationForm from '@/features/apply/ui/ApplicationForm';
import SocialLinks from '@/features/social/ui/SocialLinks';
import SiteHeader from '@/features/appShell/ui/SiteHeader';

export default function ApplyPage() {
  const t = useTranslations('app');
  const tf = useTranslations('form');
  const tw = useTranslations('welcome');

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 pt-6 pb-10 sm:pt-8 sm:pb-14">
        <SiteHeader
          homeAriaLabel={t('title')}
          title={t('title')}
          subtitle={t('subtitle')}
          primaryAction={{ href: '/apply', label: tw('applyButtonShort') }}
        />

        <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
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
