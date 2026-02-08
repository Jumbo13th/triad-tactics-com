'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { appLocales, type AppLocale } from '@/i18n/locales';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { parseContentSettingsResponse, type ContentSettingsResponse } from '@/features/content/domain/api';
import type { ContentSettings } from '@/features/content/domain/types';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from './root';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function toLocalInputValue(iso: string | null) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const offset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

const EMPTY_SETTINGS: ContentSettings = {
	upcomingGames: {
		enabled: false,
		startsAt: null,
		text: {
			en: '',
			ru: '',
			uk: '',
			ar: ''
		}
	}
};

export default function AdminContentPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';

	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [settings, setSettings] = useState<ContentSettings>(EMPTY_SETTINGS);
	const [loadingStatus, setLoadingStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
	const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const loadSettings = async () => {
		try {
			setLoadingStatus('loading');
			const res = await fetch('/api/admin/content', { cache: 'no-store' });
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseContentSettingsResponse(json);
			if (!parsed || 'error' in parsed) throw new Error('content_load_failed');
			setSettings(parsed);
			setLoadingStatus('success');
		} catch {
			setLoadingStatus('error');
		}
	};

	useEffect(() => {
		if (!status?.connected || !status.isAdmin) return;
		void loadSettings();
	}, [status]);

	const handleToggleEnabled = (value: boolean) => {
		setSettings((current) => ({
			...current,
			upcomingGames: {
				...current.upcomingGames,
				enabled: value
			}
		}));
	};

	const handleStartsAtChange = (value: string) => {
		setSettings((current) => ({
			...current,
			upcomingGames: {
				...current.upcomingGames,
				startsAt: fromLocalInputValue(value)
			}
		}));
	};

	const handleTextChange = (localeKey: AppLocale, value: string) => {
		setSettings((current) => ({
			...current,
			upcomingGames: {
				...current.upcomingGames,
				text: {
					...current.upcomingGames.text,
					[localeKey]: value
				}
			}
		}));
	};

	const handleSave = async () => {
		try {
			setSaveStatus('saving');
			const res = await fetch('/api/admin/content', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(settings)
			});
			if (!res.ok) throw new Error('save_failed');
			const json: unknown = (await res.json()) as unknown;
			const parsed = parseContentSettingsResponse(json) as ContentSettingsResponse | null;
			if (!parsed || 'error' in parsed) throw new Error('save_failed');
			setSettings(parsed);
			setSaveStatus('success');
		} catch {
			setSaveStatus('error');
		}
	};

	const localeLabels: Record<AppLocale, string> = {
		en: ta('contentLocaleEn'),
		ru: ta('contentLocaleRu'),
		uk: ta('contentLocaleUk'),
		ar: ta('contentLocaleAr')
	};

	const isLoading = loadingStatus === 'loading' || loadingStatus === 'idle';

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-4">
					<AdminToolbar title={ta('contentTitle')} />
					<p className="text-sm text-neutral-400">{ta('contentSubtitle')}</p>

					{isLoading ? (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					) : loadingStatus === 'error' ? (
						<p className="text-sm text-neutral-300">{ta('contentLoadError')}</p>
					) : (
						<form
							className="grid gap-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20"
							onSubmit={(event) => {
								event.preventDefault();
								void handleSave();
							}}
						>
							<div className="grid gap-3">
								<div>
									<p className="text-sm font-medium text-neutral-200">{ta('contentUpcomingTitle')}</p>
									<p className="mt-1 text-sm leading-relaxed text-neutral-400">
										{ta('contentUpcomingEnabledHelp')}
									</p>
								</div>
								<div className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
									<label className="flex items-center gap-3 text-sm text-neutral-200">
										<input
											type="checkbox"
											checked={settings.upcomingGames.enabled}
											onChange={(event) => handleToggleEnabled(event.target.checked)}
											className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
										/>
										<span>{ta('contentUpcomingEnabled')}</span>
									</label>
								</div>
							</div>

							<div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
								<label className="grid gap-2 text-sm text-neutral-200">
									<span className="block text-sm font-medium text-neutral-200">
										{ta('contentUpcomingStartsAt')}
									</span>
									<input
										type="datetime-local"
										value={toLocalInputValue(settings.upcomingGames.startsAt)}
										onChange={(event) => handleStartsAtChange(event.target.value)}
										className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm accent-[color:var(--accent)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-110"
									/>
								</label>
								<p className="text-xs text-neutral-400">{ta('contentUpcomingStartsAtHelp')}</p>
							</div>

							<div className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
								<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									{ta('contentUpcomingTextLabel')}
								</p>
								<p className="text-xs text-neutral-400">{ta('contentUpcomingTextHelp')}</p>
								<div className="grid gap-4">
									{appLocales.map((localeKey) => (
										<label key={localeKey} className="grid gap-2 text-sm text-neutral-200">
											<span className="block text-sm font-medium text-neutral-200">
												{localeLabels[localeKey]}
											</span>
											<textarea
												value={settings.upcomingGames.text[localeKey]}
												onChange={(event) => handleTextChange(localeKey, event.target.value)}
												rows={4}
												className="mt-2 block w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
											/>
										</label>
									))}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-3">
								<AdminButton
									variant="primary"
									className="h-9"
									disabled={saveStatus === 'saving'}
									type="submit"
								>
									{saveStatus === 'saving' ? ta('contentSaving') : ta('contentSave')}
								</AdminButton>
								{saveStatus === 'success' ? (
									<span className="text-sm text-neutral-300">{ta('contentSaved')}</span>
								) : null}
								{saveStatus === 'error' ? (
									<span className="text-sm text-neutral-300">{ta('contentSaveError')}</span>
								) : null}
							</div>
						</form>
					)}
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
