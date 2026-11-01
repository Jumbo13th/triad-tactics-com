'use client';

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { valueAt, type ReplayEvent, type ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';
import { Icon } from './glyphs';
import type { SideStyle } from './sideStyle';

type Filter = 'all' | 'kills' | 'objectives' | 'phases';

export type Who = (eid: number | null, t: number) => { name: string; side: string | null; vehicle: boolean } | null;

type Describe = {
	who: Who;
	weaponName: (wid: number | null) => string | null;
	sideName: (key: string) => string;
	sideStyle: (side: string | null) => SideStyle;
	zoneName: (zid: number) => string;
	/** Mission texts may be localization keys, like the game's own names. */
	translate: (value: string) => string;
};

type Props = Describe & {
	model: ReplayModel;
	second: number;
	playing: boolean;
	selected: number | null;
	/** Takes the viewer to the event: its time, its place on the map, the unit it happened to. */
	onPick: (event: ReplayEvent) => void;
};

const FILTERS: Filter[] = ['all', 'kills', 'objectives', 'phases'];
const MUTED = '#a3a3a3';

function inFilter(event: ReplayEvent, filter: Filter): boolean {
	if (filter === 'all') return true;
	if (filter === 'kills') return event.type === 'kill' || event.type === 'down' || event.type === 'up';
	if (filter === 'objectives') return event.type === 'capture' || event.type === 'trigger';
	return event.type === 'flow' || event.type === 'resume';
}

/** The units an event is about, for "only the selected unit". */
function actors(event: ReplayEvent): (number | null)[] {
	switch (event.type) {
		case 'kill':
			return [event.victim, event.killer];
		case 'down':
			return [event.victim, event.attacker];
		case 'up':
			return [event.victim];
		default:
			return [];
	}
}

const EventRow = memo(function EventRow({ event, future, describe, onPick }: { event: ReplayEvent; future: boolean; describe: Describe; onPick: (event: ReplayEvent) => void }) {
	const t = useTranslations('replayViewer');
	const { who, weaponName, sideName, sideStyle, zoneName, translate } = describe;
	const tint = (side: string | null) => (future ? MUTED : sideStyle(side).text);

	const person = (eid: number | null): ReactNode => {
		const found = who(eid, event.t);
		return (
			<span className="font-semibold" style={{ color: found ? tint(found.side) : MUTED }}>
				{found?.name ?? t('unknown')}
			</span>
		);
	};
	const detail = (weapon: number | null, distance: number | null): string | null => {
		const parts = [weaponName(weapon), distance !== null ? t('metres', { distance }) : null].filter(Boolean);
		return parts.length ? parts.join(' · ') : null;
	};

	let icon: ReactNode;
	let color = MUTED;
	let text: ReactNode;
	let sub: string | null = null;
	switch (event.type) {
		case 'kill': {
			const killer = event.killer !== null && event.killer !== event.victim ? who(event.killer, event.t) : null;
			const vehicle = who(event.victim, event.t)?.vehicle ?? false;
			icon = vehicle ? <Icon.VehicleKill /> : <Icon.Kill />;
			color = killer ? tint(killer.side) : MUTED;
			if (killer) {
				text = t.rich(vehicle ? 'destroyed' : 'killed', { killer: () => person(event.killer), victim: () => person(event.victim) });
				sub = detail(event.weapon, event.distance);
			} else {
				text = t.rich(vehicle ? 'destroyedAlone' : 'died', { victim: () => person(event.victim) });
			}
			break;
		}
		case 'down': {
			const attacker = event.attacker !== null ? who(event.attacker, event.t) : null;
			icon = <Icon.Down />;
			color = attacker ? tint(attacker.side) : MUTED;
			text = attacker
				? t.rich('down', { attacker: () => person(event.attacker), victim: () => person(event.victim) })
				: t.rich('downAlone', { victim: () => person(event.victim) });
			sub = detail(event.weapon, event.distance);
			break;
		}
		case 'up':
			icon = <Icon.Up />;
			color = tint(who(event.victim, event.t)?.side ?? null);
			text = t.rich('up', { victim: () => person(event.victim) });
			break;
		case 'capture':
			icon = <Icon.Flag />;
			color = tint(event.side);
			text = t.rich('captured', {
				side: () => (
					<span className="font-semibold" style={{ color: tint(event.side) }}>
						{sideName(event.side)}
					</span>
				),
				zone: () => <span className={'font-semibold ' + (future ? '' : 'text-neutral-100')}>{zoneName(event.zid)}</span>,
			});
			break;
		case 'trigger':
			icon = <Icon.Trigger />;
			color = future ? MUTED : '#d4d4d4';
			text = translate(event.label || event.key);
			break;
		case 'resume':
			icon = <Icon.Retry />;
			color = future ? MUTED : '#f5f5f5';
			text = t('resumed');
			break;
		case 'flow':
			switch (event.flow) {
				case 'game':
					icon = <Icon.Start />;
					text = t('flowGame');
					break;
				case 'freeze':
					icon = <Icon.Freeze />;
					text = t('flowFreeze', { seconds: event.seconds ?? 0 });
					break;
				case 'freeze-end':
					icon = <Icon.Thaw />;
					text = t('flowFreezeEnd');
					break;
				case 'hardfreeze':
					icon = <Icon.Freeze />;
					text = event.seconds ? t('flowHardFreeze', { seconds: event.seconds }) : t('flowHardFreezeHeld');
					break;
				case 'hardfreeze-end':
					icon = <Icon.Thaw />;
					text = t('flowHardFreezeEnd');
					break;
			}
	}

	return (
		<li>
			<button
				type="button"
				onClick={() => onPick(event)}
				className={
					'grid min-h-[40px] w-full grid-cols-[58px_16px_minmax(0,1fr)] items-start gap-x-[8px] rounded-[4px] px-[8px] py-[5px] text-left hover:bg-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] ' +
					(future ? 'text-neutral-400' : 'text-neutral-300')
				}
			>
				<span className="text-[12px] font-medium leading-[18px] tabular-nums text-neutral-400">{formatMissionTime(event.t)}</span>
				<span className="flex pt-px" style={{ color }}>
					{icon}
				</span>
				<span className="text-[13px] leading-[18px]">
					{text}
					{sub ? <span className="block text-[12px] leading-[16px] text-neutral-400">{sub}</span> : null}
				</span>
			</button>
		</li>
	);
});

export default function EventsPanel({ model, second, playing, selected, onPick, who, weaponName, sideName, sideStyle, zoneName, translate }: Props) {
	const t = useTranslations('replayViewer');
	const [filter, setFilter] = useState<Filter>('all');
	const [query, setQuery] = useState('');
	const [onlySelected, setOnlySelected] = useState(false);
	const listRef = useRef<HTMLOListElement>(null);
	const nowRef = useRef<HTMLLIElement>(null);
	const lastSecond = useRef(second);
	const now = second * 10;
	const needle = query.trim().toLocaleLowerCase();
	const selectedUnit = selected !== null ? model.entities.get(selected) : undefined;

	const describe = useMemo(() => ({ who, weaponName, sideName, sideStyle, zoneName, translate }), [who, weaponName, sideName, sideStyle, zoneName, translate]);

	// What a search can find in each event: the names as the game showed them then, the
	// weapon, the zone, and the event's own wording.
	const searchable = useMemo(() => {
		const name = (eid: number | null, at: number) => who(eid, at)?.name ?? '';
		return model.events.map((event) => {
			switch (event.type) {
				case 'kill':
					return [name(event.killer, event.t), name(event.victim, event.t), weaponName(event.weapon)].join(' ').toLocaleLowerCase();
				case 'down':
					return [name(event.attacker, event.t), name(event.victim, event.t), weaponName(event.weapon)].join(' ').toLocaleLowerCase();
				case 'up':
					return name(event.victim, event.t).toLocaleLowerCase();
				case 'capture':
					return `${sideName(event.side)} ${zoneName(event.zid)}`.toLocaleLowerCase();
				case 'trigger':
					return translate(event.label || event.key).toLocaleLowerCase();
				case 'resume':
					return t('resumed').toLocaleLowerCase();
				case 'flow':
					return (event.flow.startsWith('hardfreeze') ? t('hardFreeze') : event.flow === 'game' ? t('flowGame') : t('freeze')).toLocaleLowerCase();
			}
		});
	}, [model, who, weaponName, sideName, zoneName, translate, t]);

	const events = useMemo(() => {
		const mine = onlySelected && selectedUnit ? selectedUnit.eid : null;
		const out: ReplayEvent[] = [];
		model.events.forEach((event, i) => {
			if (!inFilter(event, filter)) return;
			if (needle !== '' && !searchable[i].includes(needle)) return;
			if (mine !== null && !involves(model, event, mine)) return;
			out.push(event);
		});
		return out;
	}, [model, filter, needle, searchable, onlySelected, selectedUnit]);

	let split = events.length;
	for (let i = 0; i < events.length; i++) {
		if (events[i].t > now) {
			split = i;
			break;
		}
	}

	// The list keeps the present in view while it plays or after a jump, but leaves a reader
	// scrolling a paused list alone.
	useEffect(() => {
		const list = listRef.current;
		const line = nowRef.current;
		const jumped = Math.abs(second - lastSecond.current) > 30;
		lastSecond.current = second;
		if (!list || !line || (!playing && !jumped)) return;
		// The list is positioned, so offsets inside it are measured from its top.
		const top = line.offsetTop;
		const view = list.clientHeight;
		if (top < list.scrollTop + view * 0.15 || top > list.scrollTop + view * 0.75) list.scrollTop = top - view * 0.4;
	}, [second, playing, filter]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-col gap-[8px] border-b border-[#1e1e1e] p-[10px]">
				<label className="relative block">
					<span className="sr-only">{t('searchEvents')}</span>
					<span className="pointer-events-none absolute left-[10px] top-[12px] flex text-neutral-400">
						<Icon.Search size={16} />
					</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t('searchEvents')}
						className="block h-[40px] w-full rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] pl-[34px] pr-[10px] text-[13px] leading-[18px] text-neutral-100 placeholder:text-neutral-500 hover:border-[#666666] focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--accent)]"
					/>
				</label>
				<div role="group" aria-label={t('showEvents')} className="grid grid-cols-4 rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] p-[2px]">
					{FILTERS.map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={filter === value}
							onClick={() => setFilter(value)}
							className={
								'min-h-[30px] min-w-0 truncate rounded-[3px] px-[2px] text-[12px] font-semibold leading-[16px] ' +
								(filter === value ? 'bg-[#2e2e2e] text-neutral-100' : 'text-neutral-400 hover:text-neutral-100')
							}
						>
							{t(`filter_${value}`)}
						</button>
					))}
				</div>
				{selectedUnit ? (
					<label className="flex min-h-[28px] cursor-pointer items-center gap-[8px] text-[12px] leading-[16px] text-neutral-300">
						<input
							type="checkbox"
							checked={onlySelected}
							onChange={(e) => setOnlySelected(e.target.checked)}
							className="size-[14px] accent-[color:var(--accent)]"
						/>
						{t('onlySelected')}
					</label>
				) : null}
			</div>
			{events.length === 0 ? (
				<p className="px-[16px] py-[12px] text-[13px] leading-[18px] text-neutral-400">{needle !== '' || onlySelected ? t('noEventMatches') : t('noEvents')}</p>
			) : (
				<ol ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-[6px] pb-[12px] pt-[4px]">
					{events.slice(0, split).map((event, i) => (
						<EventRow key={i} event={event} future={false} describe={describe} onPick={onPick} />
					))}
					<li ref={nowRef} aria-current="time" className="flex min-h-[28px] items-center gap-[8px] px-[8px]">
						<span className="text-[12px] font-semibold leading-[16px] tabular-nums text-[color:var(--accent)]">{formatMissionTime(now)}</span>
						<span aria-hidden="true" className="h-px flex-1 bg-[color:var(--accent)]" />
						<span className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-[color:var(--accent)]">{t('now')}</span>
					</li>
					{events.slice(split).map((event, i) => (
						<EventRow key={split + i} event={event} future describe={describe} onPick={onPick} />
					))}
				</ol>
			)}
		</div>
	);
}

/** Whether an event is about this unit, or about someone riding in it when it is a vehicle. */
function involves(model: ReplayModel, event: ReplayEvent, eid: number): boolean {
	for (const actor of actors(event)) {
		if (actor === null) continue;
		if (actor === eid) return true;
		const unit = model.entities.get(actor);
		if (unit && valueAt(unit.seats, event.t, null)?.vehicle === eid) return true;
	}
	return false;
}
