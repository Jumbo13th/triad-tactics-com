'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/locales';

function formatUnit(value: number) {
	return value.toString().padStart(2, '0');
}

function toTimeParts(diffMs: number) {
	const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return { days, hours, minutes, seconds };
}

type UpcomingGamesWidgetProps = {
	startsAt: string;
	text: Record<AppLocale, string>;
};

export default function UpcomingGamesWidget({ startsAt, text }: UpcomingGamesWidgetProps) {
	const t = useTranslations('welcome');
	const locale = useLocale();
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const timeZone = useMemo(() => {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	}, []);

	const startDate = useMemo(() => new Date(startsAt), [startsAt]);
	const startValid = !Number.isNaN(startDate.getTime());
	const diffMs = startValid ? startDate.getTime() - now : 0;
	const countdown = toTimeParts(diffMs);
	const isLive = diffMs <= 0;

	const formattedStart = useMemo(() => {
		if (!startValid) return null;
		return new Intl.DateTimeFormat(locale, {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone
		}).format(startDate);
	}, [locale, startDate, startValid, timeZone]);

	const bodyText = text[locale as AppLocale] || text.en || t('upcomingGames.textFallback');

	const units = [
		{ key: 'days', value: countdown.days, label: t('upcomingGames.units.days') },
		{ key: 'hours', value: countdown.hours, label: t('upcomingGames.units.hours') },
		{ key: 'minutes', value: countdown.minutes, label: t('upcomingGames.units.minutes') },
		{ key: 'seconds', value: countdown.seconds, label: t('upcomingGames.units.seconds') }
	];

	return (
		<section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-sm shadow-black/20 sm:p-6">
			<div
				className="pointer-events-none absolute -top-20 right-8 h-40 w-40 rounded-full bg-[color:var(--accent)]/20 blur-3xl"
				aria-hidden="true"
			/>
			<div
				className="pointer-events-none absolute -bottom-24 left-6 h-48 w-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl"
				aria-hidden="true"
			/>
			<div className="relative grid gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
							{t('upcomingGames.title')}
						</p>
						<h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">
							{t('upcomingGames.countdownTitle')}
						</h2>
					</div>
				</div>

				<div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
					{units.map((unit) => (
						<div
							key={unit.key}
							className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 sm:px-4 sm:py-3"
						>
							<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(210,184,83,0.15),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
							<div className="relative flex items-center justify-between">
								<span className="text-2xl font-semibold text-neutral-50 sm:text-3xl">
									{formatUnit(unit.value)}
								</span>
								<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-xs">
									{unit.label}
								</span>
							</div>
						</div>
					))}
				</div>

			<div className="inline-flex w-fit items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs font-semibold text-neutral-300 self-start">
				{formattedStart ? (
					<span>
						{t('upcomingGames.startsAtLabel')}: {formattedStart}
					</span>
				) : (
					<span>{t('upcomingGames.startsAtLabel')}</span>
				)}
			</div>

				{isLive ? (
					<div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]">
						<span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--accent)] shadow-[0_0_12px_rgba(210,184,83,0.9)]" />
						{t('upcomingGames.liveLabel')}
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
					<span className="inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]/70" />
					<span>{t('upcomingGames.localTimeHint', { timezone: timeZone })}</span>
				</div>

				<div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

				<div className="rounded-2xl bg-white/[0.03] px-4 py-3">
					<p className="text-sm text-neutral-200 whitespace-pre-line">{bodyText}</p>
				</div>
			</div>
		</section>
	);
}
