'use client';

import { useParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/routing';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' }
];

export default function LanguageSwitcher({ framed = true }: { framed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLocale = (params.locale as string) || 'en';

  const handleLanguageChange = (locale: string) => {
    router.replace(pathname, { locale });
  };

  return (
    <div className={framed ? 'w-full sm:w-auto' : 'w-full'}>
      <label className="sr-only" htmlFor="language">
        Language
      </label>
      <select
        id="language"
        value={currentLocale}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className={
          (framed
            ? 'w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/20 '
            : 'w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-50 ') +
          'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950'
        }
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.code.toUpperCase()} — {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
