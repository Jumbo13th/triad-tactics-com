'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ReplayEvent, ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';
import { readableOnDark } from './readableColor';

type Filter = 'all' | 'kills' | 'objectives' | 'phases';

const SHOWN = 300;

type Props = {
	model: ReplayModel;
	second: number;
	who: (eid: number | null, t: number) => { name: string; color: string } | null;
	weaponName: (wid: number | null) => string | null;
	sideName: (key: string) => string;
	sideColor: (side: string | null) => string;
	zoneName: (zid: number) => string;
	onSeek: (t: number) => void;
};

function inFilter(event: ReplayEvent, filter: Filter): boolean {
	if (filter === 'all') return true;
	if (filter === 'kills') return event.type === 'kill' || event.type === 'down' || event.type === 'up';
	if (filter === 'objectives') return event.type === 'capture' || event.type === 'trigger';
	return event.type === 'flow' || event.type === 'resume';
}

export default function EventsPanel({ model, second, who, weaponName, sideName, sideColor, zoneName, onSeek }: Props) {
	const t = useTranslations('replayViewer');
	const [filter, setFilter] = useState<Filter>('all');
	const now = second * 10;

	const shown = useMemo(() => {
		const out: ReplayEvent[] = [];
		for (let i = model.events.length - 1; i >= 0 && out.length < SHOWN; i--) {
			const event = model.events[i];
			if (event.t <= now && inFilter(event, filter)) out.push(event);
		}
		return out;
	}, [model, now, filter]);

	const person = (eid: number | null, at: number, fallback: string): ReactNode => {
		const found = who(eid, at);
		return (
			<span className="font-semibold" style={{ color: found?.color ?? '#c7ccd2' }}>
				{found?.name ?? fallback}
			</span>
		);
	};

	const detail = (weapon: number | null, distance: number | null): string | null => {
		const parts = [weaponName(weapon), distance !== null ? t('metres', { distance }) : null].filter(Boolean);
		return parts.length ? parts.join(' · ') : null;
	};

	const describe = (event: ReplayEvent): { text: ReactNode; sub: string | null; tone?: string } => {
		switch (event.type) {
			case 'kill':
				return event.killer === null || event.killer === event.victim
					? { text: t.rich('died', { victim: () => person(event.victim, event.t, t('unknown')) }), sub: null }
					: {
							text: t.rich('killed', {
								killer: () => person(event.killer, event.t, t('unknown')),
								victim: () => person(event.victim, event.t, t('unknown')),
							}),
							sub: detail(event.weapon, event.distance),
						};
			case 'down':
				return {
					text:
						event.attacker === null
							? t.rich('downAlone', { victim: () => person(event.victim, event.t, t('unknown')) })
							: t.rich('down', {
									attacker: () => person(event.attacker, event.t, t('unknown')),
									victim: () => person(event.victim, event.t, t('unknown')),
								}),
					sub: detail(event.weapon, event.distance),
				};
			case 'up':
				return { text: t.rich('up', { victim: () => person(event.victim, event.t, t('unknown')) }), sub: null };
			case 'capture':
				return {
					text: t.rich('captured', {
						side: () => (
							<span className="font-semibold" style={{ color: readableOnDark(sideColor(event.side)) }}>
								{sideName(event.side)}
							</span>
						),
						zone: () => <span className="font-semibold">{zoneName(event.zid)}</span>,
					}),
					sub: null,
				};
			case 'trigger':
				return { text: event.label || event.key, sub: null };
			case 'resume':
				return { text: t('resumed'), sub: null, tone: 'text-amber-300' };
			case 'flow':
				switch (event.flow) {
					case 'game':
						return { text: t('flowGame'), sub: null };
					case 'freeze':
						return { text: t('flowFreeze', { seconds: event.seconds ?? 0 }), sub: null };
					case 'freeze-end':
						return { text: t('flowFreezeEnd'), sub: null };
					case 'hardfreeze':
						return { text: event.seconds ? t('flowHardFreeze', { seconds: event.seconds }) : t('flowHardFreezeHeld'), sub: null };
					case 'hardfreeze-end':
						return { text: t('flowHardFreezeEnd'), sub: null };
				}
		}
	};

	const filters: Filter[] = ['all', 'kills', 'objectives', 'phases'];

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-wrap gap-1.5 p-3">
				{filters.map((value) => (
					<button
						key={value}
						type="button"
						aria-pressed={filter === value}
						onClick={() => setFilter(value)}
						className={
							'min-h-8 rounded-lg px-3 text-xs font-semibold ' +
							(filter === value ? 'bg-[color:var(--accent)] text-neutral-950' : 'bg-white/5 text-neutral-300 hover:bg-white/10')
						}
					>
						{t(`filter_${value}`)}
					</button>
				))}
			</div>
			{shown.length === 0 ? (
				<p className="px-4 text-sm text-neutral-400">{t('noEvents')}</p>
			) : (
				<ol className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
					{shown.map((event, i) => {
						const { text, sub, tone } = describe(event);
						return (
							<li key={`${event.t}-${event.type}-${i}`}>
								<button
									type="button"
									onClick={() => onSeek(Math.max(0, event.t - 50))}
									className="grid w-full grid-cols-[4.25rem_minmax(0,1fr)] gap-2 rounded-lg p-2 text-left hover:bg-white/5"
								>
									<span className="font-mono text-xs font-semibold tabular-nums text-neutral-400">{formatMissionTime(event.t)}</span>
									<span className={'text-[13px] leading-snug ' + (tone ?? 'text-neutral-200')}>
										{text}
										{sub ? <span className="block text-xs text-neutral-400">{sub}</span> : null}
									</span>
								</button>
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
