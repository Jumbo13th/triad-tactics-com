'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { parseSubmitApplicationResponse } from '@/features/apply/domain/api';
import { parseUserStatus, type UserStatus } from '@/features/users/domain/api';
import { applicationSchema, type ApplicationFormData } from '../schema';
import type { ZodIssue } from 'zod';
import { SteamSignInButton } from '@/features/steamAuth/ui/root';
import { CallsignField, CallsignSearch } from '@/features/callsign/ui/root';

const TIMEZONE_OPTIONS = Array.from({ length: 27 }, (_, i) => i - 12).map(offset => {
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.abs(offset).toString().padStart(2, '0');
  return {
    value: `UTC${sign}${hours}:00`,
    label: `UTC${sign}${hours}:00`
  };
});

export default function ApplicationForm(props: { initialSteamConnected?: boolean } = {}) {
  const t = useTranslations('form');
  const params = useParams();
  const locale = (params?.locale as string | undefined) ?? 'en';
  const initialSteamConnected = props.initialSteamConnected === true;
  const supportEmail = t('supportEmail');
  const showSupportEmail = typeof supportEmail === 'string' && supportEmail.includes('@');
  const [formData, setFormData] = useState<ApplicationFormData>({
    callsign: '',
    name: '',
    age: '',
    email: '',
    city: '',
    country: '',
    availability: '',
    timezone: '',
    experience: '',
    motivation: ''
  });

  const [steamAuth, setSteamAuth] = useState<UserStatus | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState<number | null>(null);
  const [popup, setPopup] = useState<null | { title: string; message?: string; lines?: string[] }>(null);
  const [steamRequiredAttempted, setSteamRequiredAttempted] = useState(false);

  const isSteamConnected = steamAuth?.connected === true;
  const hasExistingApplication = steamAuth?.connected === true && steamAuth?.hasExisting === true;
  const canSubmit = !isSubmitting;

  const isSteamReadyConnected = isSteamConnected || (steamAuth === null && initialSteamConnected);

  useEffect(() => {
    if (isSteamConnected) {
      setSteamRequiredAttempted(false);
    }
  }, [isSteamConnected]);

  const fieldSchemas = useMemo(() => {
    return applicationSchema.shape;
  }, []);

  const refreshSteamAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        setSteamAuth({ connected: false });
        return;
      }

      const json: unknown = (await res.json()) as unknown;
      const parsed = parseUserStatus(json);
      setSteamAuth(parsed ?? { connected: false });
    } catch {
      setSteamAuth({ connected: false });
    }
  }, []);

  useEffect(() => {
    refreshSteamAuth();
  }, [refreshSteamAuth]);

  const rateLimitOpen = rateLimitSecondsLeft !== null;
  const rateLimitTime = useMemo(() => {
    const total = rateLimitSecondsLeft ?? 0;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [rateLimitSecondsLeft]);

  useEffect(() => {
    if (!rateLimitOpen) return;

    const id = setInterval(() => {
      setRateLimitSecondsLeft(prev => {
        if (prev == null) return prev;
        return Math.max(0, prev - 1);
      });
    }, 1000);

    return () => clearInterval(id);
  }, [rateLimitOpen]);

  const translateIssue = (issue: ZodIssue) => {
    const params: Record<string, string | number | Date> = {};
    if (issue.code === 'too_small' && typeof issue.minimum === 'number') {
      params.min = issue.minimum;
    }
    if (issue.code === 'too_big' && typeof issue.maximum === 'number') {
      params.max = issue.maximum;
    }
    return t(`errors.${issue.message}`, params);
  };

  const validateOne = (field: keyof ApplicationFormData, value: string): string | null => {
    const schema = fieldSchemas[field];
    if (!schema) return null;
    const result = schema.safeParse(value);
    if (result.success) return null;
    const issue = result.error.issues?.[0];
    return issue ? translateIssue(issue) : t('errors.required');
  };

  const focusField = (field: string) => {
    const el = document.getElementById(field) as (HTMLElement | null);
    if (!el) return;
    try {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {}
  };

  const scrollToSteamAuth = () => {
    const el = document.getElementById('steam-auth') as (HTMLElement | null);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}
  };

  const validateAll = (
    data: ApplicationFormData
  ): { ok: true; errors: Record<string, string> } | { ok: false; errors: Record<string, string>; firstField: string | null } => {
    const validation = applicationSchema.safeParse(data);
    if (validation.success) {
      return { ok: true, errors: {} };
    }

    const newErrors: Record<string, string> = {};
    let firstField: string | null = null;

    validation.error.issues.forEach(issue => {
      const fieldKey = issue.path?.[0];
      const path = issue.path.join('.');
      const translated = translateIssue(issue);

      if (!newErrors[path]) {
        newErrors[path] = translated;
      }
      if (!firstField && typeof fieldKey === 'string') {
        firstField = fieldKey;
      }
    });

    return { ok: false, errors: newErrors, firstField };
  };

  const handleChange = (field: keyof ApplicationFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

  // Callsign availability checks are async; make syntax errors immediate to avoid confusing
  // "couldn't check" messages for obviously invalid inputs like "[TT]".
  if (field === 'callsign') {
    const trimmed = value.trim();
    const hasValue = trimmed.length > 0;
    const charsAllowed = /^[A-Za-z0-9_]*$/.test(trimmed);

    setErrors((prev) => {
      const next = { ...prev };
      // Clear prior field errors by default.
      delete next[field];

      if (hasValue && !charsAllowed) {
        next[field] = t('errors.callsignInvalidChars');
      }
      return next;
    });
    return;
  }

  setErrors(prev => {
    const newErrors = { ...prev };
    delete newErrors[field];
    return newErrors;
  });
  };

  const handleBlur = (field: keyof ApplicationFormData) => {
    const value = formData[field];
    const error = validateOne(field, value);

    if (error) {
      setErrors(prev => ({
        ...prev,
        [field]: error
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setPopup(null);

    setErrors(prev => {
      const next = { ...prev };
      delete next.general;
      return next;
    });

    const fieldResult = validateAll(formData);
    if (!fieldResult.ok) {
      setErrors(fieldResult.errors);

      if (steamAuth?.connected !== true) {
        setSteamRequiredAttempted(true);
      }

      if (fieldResult.firstField) {
        setTimeout(() => focusField(fieldResult.firstField as string), 0);
      }
      return;
    }

    if (!isSteamReadyConnected) {
      setSteamRequiredAttempted(true);
      setTimeout(() => scrollToSteamAuth(), 0);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          locale
        })
      });

      const parsed = parseSubmitApplicationResponse(await response.json());
      const errorCode = parsed?.kind === 'error' ? parsed.error : undefined;

      if (!response.ok) {
        switch (errorCode) {
          case 'rate_limited': {
            const seconds = parsed?.kind === 'error' && typeof parsed.retryAfterSeconds === 'number'
              ? parsed.retryAfterSeconds
              : 120;
            setRateLimitSecondsLeft(Math.max(0, Math.floor(seconds)));
            break;
          }
          case 'duplicate': {
            setPopup({ title: t('duplicate.title'), message: t('duplicate.message') });
            break;
          }
          case 'steam_not_connected':
          case 'steam_required': {
            setPopup({ title: t('popup.errorTitle'), message: t('errors.steamNotConnected') });
            refreshSteamAuth();
            break;
          }
          case 'steam_api_unavailable': {
            setPopup({ title: t('popup.errorTitle'), message: t('errors.steamApiUnavailable') });
            break;
          }
          case 'steam_game_not_detected': {
            setPopup({
              title: t('popup.errorTitle'),
              message: t('errors.steamGameNotDetected'),
              lines: [
                t('steamAuth.detect.title'),
                `• ${t('steamAuth.detect.profilePublic')}`,
                `• ${t('steamAuth.detect.gameDetailsPublic')}`,
                `• ${t('steamAuth.detect.gameNotHidden')}`,
                `• ${t('steamAuth.detect.delayAfterChange')}`,
                `• ${t('steamAuth.detect.canRehideAfterSubmit')}`,
                t('steamAuth.detect.incognitoCheck')
              ]
            });
            break;
          }
          default: {
            setPopup({ title: t('popup.errorTitle'), message: t('errors.serverError') });
            break;
          }
        }
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
    } catch {
      setErrors({ general: t('errors.serverError') });
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full">
        <div className="text-center py-10 sm:py-14">
          <div className="mb-5">
            <svg className="mx-auto h-14 w-14 text-[color:var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {t('success')}
          </h2>
          <p className="mt-3 text-neutral-300">
            {t('successMessage')}
          </p>
        </div>
      </div>
    );
  }

  if (hasExistingApplication) {
    return (
      <div className="w-full">
        <div className="text-center py-10 sm:py-14">
          <div className="mb-5">
            <svg className="mx-auto h-14 w-14 text-[color:var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {t('duplicate.title')}
          </h2>
          <p className="mt-3 text-neutral-300">
            {t('duplicate.message')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {showSupportEmail && (
        <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <p className="text-base leading-relaxed text-neutral-300">
            {t('supportNote')}{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="font-medium text-neutral-100 underline decoration-neutral-600 underline-offset-2 hover:text-[color:var(--accent)]"
            >
              {supportEmail}
            </a>
          </p>
        </div>
      )}

      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/30 sm:p-6">
            <h3 className="text-lg font-semibold tracking-tight text-neutral-50">
              {popup.title}
            </h3>
            {popup.message && (
              <p className="mt-2 text-sm text-neutral-300">
                {popup.message}
              </p>
            )}
            {popup.lines && popup.lines.length > 0 && (
              <div className="mt-3 space-y-1.5 text-sm text-neutral-200">
                {popup.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-neutral-950 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
              >
                {t('popup.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rateLimitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/30 sm:p-6">
            <h3 className="text-lg font-semibold tracking-tight text-neutral-50">
              {t('rateLimit.title')}
            </h3>
            <p className="mt-2 text-sm text-neutral-300">
              {t('rateLimit.message')}
            </p>
            <p className="mt-3 text-sm text-neutral-200">
              {t('rateLimit.retryIn', { time: rateLimitTime })}
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setRateLimitSecondsLeft(null)}
                className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-neutral-950 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
              >
                {t('rateLimit.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="steam-auth" className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-base font-medium text-neutral-200">{t('steamAuth.title')}</p>
            {steamAuth?.connected && (
              <p className="mt-1 text-base text-neutral-300">
                {steamAuth.personaName
                  ? t('steamAuth.connectedAsName', { name: steamAuth.personaName })
                  : t('steamAuth.connectedAsId', { steamid64: steamAuth.steamid64 })}
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('steamAuth.help')}</p>

            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <p className="text-sm font-medium text-neutral-200">{t('steamAuth.detect.title')}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
                <li>{t('steamAuth.detect.profilePublic')}</li>
                <li>{t('steamAuth.detect.gameDetailsPublic')}</li>
                <li>{t('steamAuth.detect.gameNotHidden')}</li>
                <li>{t('steamAuth.detect.delayAfterChange')}</li>
                <li>{t('steamAuth.detect.canRehideAfterSubmit')}</li>
              </ul>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('steamAuth.detect.incognitoCheck')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {steamAuth?.connected ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch('/api/auth/steam/logout', { method: 'POST' });
                  } finally {
                    await refreshSteamAuth();
                  }
                }}
                className="inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-50 hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
              >
                {t('steamAuth.disconnect')}
              </button>
            ) : (
              <>
                <span className="text-base text-neutral-300">{t('steamAuth.clickToConnect')}</span>
                <SteamSignInButton
                  redirectPath={`/${locale}/apply`}
                  ariaLabel={t('steamAuth.connect')}
                  size="large"
                  imageClassName="h-11 w-auto"
                />
              </>
            )}
          </div>

        </div>
      </div>

      {isSteamReadyConnected ? (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20">
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-neutral-50">{t('callsignSection.title')}</h3>
            <p className="text-base leading-relaxed text-neutral-300">{t('callsignSection.intro')}</p>
          </div>

            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <p className="text-sm font-medium text-neutral-200">{t('callsignRules.title')}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
                <li>{t('callsignRules.allowedChars')}</li>
                <li>{t('callsignRules.maxLength')}</li>
                <li>{t('callsignRules.uniqueness')}</li>
                <li>{t('callsignRules.noOffense')}</li>
                <li>{t('callsignRules.neutral')}</li>
                <li>{t('callsignRules.noProjectSquads')}</li>
                <li>{t('callsignRules.noRealUnits')}</li>
                <li>{t('callsignRules.noEquipment')}</li>
                <li>{t('callsignRules.keepSimple')}</li>
              </ul>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('callsignRules.adminNote')}</p>
            </div>

          <div className="mt-4">
            <CallsignField value={formData.callsign} onChange={(v) => handleChange('callsign', v)} onBlur={() => handleBlur('callsign')} error={errors.callsign} />
          </div>

          <div className="mt-4">
            <CallsignSearch />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-200">
              {t('name')} <span className="text-sm font-normal text-neutral-400">({t('optional')})</span>
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              placeholder={t('namePlaceholder')}
              className={`mt-2 block w-full rounded-lg border ${errors.name ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
              autoComplete="name"
            />
            {errors.name ? (
              <p className="mt-2 text-sm text-red-400">{errors.name}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('nameHelp')}</p>
            )}
          </div>

          <div>
            <label htmlFor="age" className="block text-sm font-medium text-neutral-200">
              {t('age')}
            </label>
            <input
              id="age"
              type="text"
              inputMode="numeric"
              value={formData.age}
              onChange={(e) => handleChange('age', e.target.value)}
              onBlur={() => handleBlur('age')}
              placeholder={t('agePlaceholder')}
              className={`mt-2 block w-full rounded-lg border ${errors.age ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
            />
            {errors.age ? (
              <p className="mt-2 text-sm text-red-400">{errors.age}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('ageHelp')}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-200">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
            placeholder={t('emailPlaceholder')}
            className={`mt-2 block w-full rounded-lg border ${errors.email ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
            autoComplete="email"
          />
          {errors.email ? (
            <p className="mt-2 text-sm text-red-400">{errors.email}</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('emailHelp')}</p>
          )}
        </div>

        <hr className="border-neutral-800" />

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-neutral-200">
              {t('timezone')}
            </label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              onBlur={() => handleBlur('timezone')}
              className={`mt-2 block w-full rounded-lg border ${errors.timezone ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
            >
              <option value="" className="bg-neutral-950">{t('timezonePlaceholder')}</option>
              {TIMEZONE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-neutral-950">
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.timezone ? (
              <p className="mt-2 text-sm text-red-400">{errors.timezone}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('timezoneHelp')}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-neutral-200">
              {t('city')}{' '}
              <span className="text-sm font-normal text-neutral-400">({t('optional')})</span>
            </label>
            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => handleChange('city', e.target.value)}
              onBlur={() => handleBlur('city')}
              placeholder={t('cityPlaceholder')}
              className={`mt-2 block w-full rounded-lg border ${errors.city ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
            />
            {errors.city ? (
              <p className="mt-2 text-sm text-red-400">{errors.city}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('cityHelp')}</p>
            )}
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium text-neutral-200">
              {t('country')}{' '}
              <span className="text-sm font-normal text-neutral-400">({t('optional')})</span>
            </label>
            <input
              id="country"
              type="text"
              value={formData.country}
              onChange={(e) => handleChange('country', e.target.value)}
              onBlur={() => handleBlur('country')}
              placeholder={t('countryPlaceholder')}
              className={`mt-2 block w-full rounded-lg border ${errors.country ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
            />
            {errors.country ? (
              <p className="mt-2 text-sm text-red-400">{errors.country}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('countryHelp')}</p>
            )}
          </div>
        </div>

        <hr className="border-neutral-800" />

        <div>
          <label htmlFor="availability" className="block text-sm font-medium text-neutral-200">
            {t('availability')}
          </label>
          <input
            id="availability"
            type="text"
            value={formData.availability}
            onChange={(e) => handleChange('availability', e.target.value)}
            onBlur={() => handleBlur('availability')}
            placeholder={t('availabilityPlaceholder')}
            className={`mt-2 block w-full rounded-lg border ${errors.availability ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
          />
          {errors.availability ? (
            <p className="mt-2 text-sm text-red-400">{errors.availability}</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('availabilityHelp')}</p>
          )}
        </div>

        <hr className="border-neutral-800" />

        <div>
          <label htmlFor="experience" className="block text-sm font-medium text-neutral-200">
            {t('experience')}
          </label>
          <textarea
            id="experience"
            value={formData.experience}
            onChange={(e) => handleChange('experience', e.target.value)}
            onBlur={() => handleBlur('experience')}
            placeholder={t('experiencePlaceholder')}
            rows={5}
            className={`mt-2 block w-full resize-y rounded-lg border ${errors.experience ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
          />
          <div className="mt-2 flex justify-between items-center">
            <p className="text-sm text-neutral-400">{t('experienceHelp')}</p>
            <p className={`text-sm ${formData.experience.trim().length < 10 ? 'text-red-400' : 'text-neutral-500'}`}>
              {formData.experience.trim().length} / 10 min
            </p>
          </div>
          {errors.experience && (
            <p className="mt-1 text-sm text-red-400">{errors.experience}</p>
          )}
        </div>

        <div>
          <label htmlFor="motivation" className="block text-sm font-medium text-neutral-200">
            {t('motivation')}
          </label>
          <textarea
            id="motivation"
            value={formData.motivation}
            onChange={(e) => handleChange('motivation', e.target.value)}
            onBlur={() => handleBlur('motivation')}
            placeholder={t('motivationPlaceholder')}
            rows={5}
            className={`mt-2 block w-full resize-y rounded-lg border ${errors.motivation ? 'border-red-500' : 'border-neutral-700'} bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20`}
          />
          <div className="mt-2 flex justify-between items-center">
            <p className="text-sm text-neutral-400">{t('motivationHelp')}</p>
            <p className={`text-sm ${formData.motivation.trim().length < 10 ? 'text-red-400' : 'text-neutral-500'}`}>
              {formData.motivation.trim().length} / 10 min
            </p>
          </div>
          {errors.motivation && (
            <p className="mt-1 text-sm text-red-400">{errors.motivation}</p>
          )}
        </div>

        <div className="pt-2">
          {errors.general && (
            <p className="mb-3 text-sm text-red-400">{errors.general}</p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-neutral-950 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
          {!isSteamConnected && steamRequiredAttempted && (
            <p className="mt-2 text-sm text-red-400">{t('steamRequiredNote')}</p>
          )}
        </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-sm text-neutral-300">{t('steamAuth.notConnected')}</p>
        </div>
      )}
    </div>
  );
}
