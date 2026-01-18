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
    <div className={(framed ? 'w-full sm:w-auto' : 'w-full') + ' relative'}>
      <label className="sr-only" htmlFor="language">
        Language
      </label>
      <select
        id="language"
        value={currentLocale}
        onChange={(e) => handleLanguageChange(e.target.value)}
        className={
          (framed
            ? 'w-full appearance-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 pr-10 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/20 '
            : 'w-full appearance-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 pr-10 text-sm font-semibold text-neutral-50 ') +
          'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950'
        }
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.code.toUpperCase()} — {lang.name}
          </option>
        ))}
      </select>

      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
