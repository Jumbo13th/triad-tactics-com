'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { Rotation, RotationUnitEntry, RotationCommanderPair } from '../domain/types';

type TFn = ReturnType<typeof useTranslations<'rotation'>>;

export default function RotationSection({ rotation }: { rotation: Rotation }) {
	const t = useTranslations('rotation');
	const locale = useLocale();

	const hasSides = rotation.sideA.length > 0 || rotation.sideB.length > 0;
	if (!hasSides) return null;

	const { sideAColor, sideBColor } = rotation.config;

	return (
		<div id="rotation" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
			<h3 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h3>
			<p className="mt-2 text-sm text-neutral-300 sm:text-base">{t('subtitle')}</p>

			<div className="mt-6 grid gap-4 lg:grid-cols-2">
				<SidePanel
					label={rotation.config.sideAName}
					color={sideAColor}
					units={rotation.sideA}
					t={t}
				/>
				<SidePanel
					label={rotation.config.sideBName}
					color={sideBColor}
					units={rotation.sideB}
					t={t}
				/>
			</div>

			{(() => {
				const today = new Date();
				const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
				const upcoming = rotation.commanderSchedule.filter((pair) => pair.scheduledDate >= todayStr);
				if (upcoming.length === 0) return null;
				return (
					<div className="mt-6">
						<h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">{t('commanderScheduleTitle')}</h4>
						<div className="mt-3 grid gap-2">
							{upcoming.map((pair) => (
								<ScheduleRow key={pair.id} pair={pair} sideAColor={sideAColor} sideBColor={sideBColor} locale={locale} t={t} />
							))}
						</div>
					</div>
				);
			})()}
		</div>
	);
}

function SidePanel({ label, color, units, t }: { label: string; color: string; units: RotationUnitEntry[]; t: TFn }) {
	return (
		<div className="rounded-xl border bg-neutral-950/60 p-4" style={{ borderColor: `${color}35` }}>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
					<h4 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color }}>{label}</h4>
				</div>
				<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
					{t('unitsOnSide', { count: units.length })}
				</span>
			</div>

			{units.length === 0 ? (
				<p className="mt-3 text-sm text-neutral-500">{t('noUnitsAssigned')}</p>
			) : (
				<div className="mt-3 flex flex-wrap gap-2">
					{units.map((unit) => (
						<Link
							key={unit.unitId}
							href={`/units/${unit.unitTag}`}
							className="inline-flex items-center gap-1.5 rounded-lg border bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800/80"
							style={{ borderColor: `${color}25` }}
							title={`${unit.unitName} — ${t('slots', { count: unit.slotsAllocated })}${unit.leaderCallsign ? ` — ${t('leader', { callsign: unit.leaderCallsign })}` : ''}`}
						>
							<span className="font-semibold" style={{ color }}>[{unit.unitTag}]</span>
							<span className="text-neutral-300">{unit.unitName}</span>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

function ScheduleRow({ pair, sideAColor, sideBColor, locale, t }: { pair: RotationCommanderPair; sideAColor: string; sideBColor: string; locale: string; t: TFn }) {
	const formattedDate = formatScheduleDate(pair.scheduledDate, locale);

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-2.5 transition hover:bg-white/[0.03]">
			<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sideAColor }} />
			<Link href={`/units/${pair.sideAUnitTag}`} className="text-sm font-semibold text-neutral-50 transition hover:text-[color:var(--accent)]">[{pair.sideAUnitTag}] {pair.sideAUnitName}</Link>
			<span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">{t('vs')}</span>
			<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sideBColor }} />
			<Link href={`/units/${pair.sideBUnitTag}`} className="text-sm font-semibold text-neutral-50 transition hover:text-[color:var(--accent)]">[{pair.sideBUnitTag}] {pair.sideBUnitName}</Link>
			<span className="ml-auto inline-flex items-center rounded-full border border-neutral-800 bg-white/5 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-neutral-300">
				{formattedDate}
			</span>
		</div>
	);
}

function formatScheduleDate(dateStr: string, locale: string): string {
	const [y, m, d] = dateStr.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}
