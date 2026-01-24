import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { SocialLinks } from '@/features/social/ui/root';

export default function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="mt-6 border-t border-neutral-900 pt-6 text-sm text-neutral-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; 2026 Triad Tactics</p>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="text-neutral-400 transition hover:text-neutral-200">
            {t('termsLink')}
          </Link>
          <SocialLinks />
        </div>
      </div>
    </footer>
  );
}
