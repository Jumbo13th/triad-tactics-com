'use client';

import { useParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/routing';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' }
];

export default function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLocale = params.locale as string;

  const handleLanguageChange = (locale: string) => {
    router.replace(pathname, { locale });
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 p-1 sm:inline-flex sm:w-auto sm:justify-start">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => handleLanguageChange(lang.code)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            currentLocale === lang.code
              ? 'bg-[color:var(--accent)] text-neutral-950'
              : 'text-neutral-300 hover:bg-neutral-900'
          }`}
          title={lang.name}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
