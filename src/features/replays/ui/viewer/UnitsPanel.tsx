'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { segmentAt, valueAt, type Entity, type Life, type ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';
import { DeadGlyph, DiamondGlyph, DotGlyph, Icon, SquadGlyph, UnconsciousGlyph, VehicleGlyph } from './glyphs';
import { DEAD_STYLE, type SideStyle } from './sideStyle';

type Props = {
	model: ReplayModel;
	/** Whole seconds of mission time, so the list redraws once a second. */
	second: number;
	follow: number | null;
	sideName: (key: string) => string;
	sideStyle: (side: string | null) => SideStyle;
	callsignFor: (groupKey: string) => string;
	playerName: (eid: number, t: number) => string | null;
	roleName: (entity: Entity) => string;
	vehicleName: (eid: number) => string;
	onFollow: (eid: number) => void;
};

type Member = { entity: Entity; life: Life; player: string | null; role: string };
type Squad = { key: string; side: string; callsign: string; members: Member[]; matched: Member[] };
type Vehicle = { entity: Entity; name: string; wreck: boolean; crew: number };
type SideView = { key: string; alive: number; total: number; squads: Squad[]; vehicles: Vehicle[] };

const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';

function present(entity: Entity, now: number): boolean {
	if (entity.appearedAt > now) return false;
	// A body the game cleared away still counts as one of its squad's dead.
	return entity.removedAt === null || entity.removedAt > now || valueAt(entity.life, entity.removedAt, 'alive') === 'dead';
}

export default function UnitsPanel(props: Props) {
	const { model, second, follow, sideName, sideStyle, callsignFor, playerName, roleName, vehicleName, onFollow } = props;
	const t = useTranslations('replayViewer');
	const [query, setQuery] = useState('');
	const [sideFilter, setSideFilter] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const listRef = useRef<HTMLDivElement>(null);
	const followedRef = useRef<HTMLButtonElement>(null);
	const now = second * 10;
	const needle = query.trim().toLocaleLowerCase();

	const sides = useMemo(() => {
		const segment = segmentAt(model, now);
		const bySide = new Map<string, SideView>(model.sides.map((side) => [side.key, { key: side.key, alive: 0, total: 0, squads: [], vehicles: [] }]));
		const squads = new Map<string, Squad>();
		const crews = new Map<number, number>();
		const matches = (text: string | null) => needle !== '' && text !== null && text.toLocaleLowerCase().includes(needle);

		for (const entity of model.entities.values()) {
			if (entity.kind !== 'man' || !present(entity, now)) continue;
			const life = valueAt(entity.life, now, 'alive');
			const seat = valueAt(entity.seats, now, null);
			if (seat && life !== 'dead') crews.set(seat.vehicle, (crews.get(seat.vehicle) ?? 0) + 1);
			const side = entity.side ? bySide.get(entity.side) : undefined;
			if (!side) continue;
			side.total++;
			if (life !== 'dead') side.alive++;
			const groupKey = entity.groups.get(segment);
			const group = groupKey ? model.groups.get(groupKey) : undefined;
			if (!group) continue;
			let squad = squads.get(group.key);
			if (!squad) {
				squad = { key: group.key, side: side.key, callsign: callsignFor(group.key), members: [], matched: [] };
				squads.set(group.key, squad);
				side.squads.push(squad);
			}
			const member = { entity, life, player: playerName(entity.eid, now), role: roleName(entity) };
			squad.members.push(member);
			if (matches(member.player) || matches(member.role)) squad.matched.push(member);
		}
		for (const entity of model.entities.values()) {
			if (entity.kind === 'man' || entity.kind === 'tracker' || !present(entity, now)) continue;
			const side = entity.side ? bySide.get(entity.side) : undefined;
			const name = vehicleName(entity.eid);
			if (side && (needle === '' || matches(name))) {
				side.vehicles.push({ entity, name, wreck: valueAt(entity.life, now, 'alive') === 'dead', crew: crews.get(entity.eid) ?? 0 });
			}
		}
		for (const side of bySide.values()) {
			side.squads.sort((a, b) => a.callsign.localeCompare(b.callsign, undefined, { numeric: true }));
			if (needle !== '') side.squads = side.squads.filter((squad) => matches(squad.callsign) || squad.matched.length > 0);
		}
		return [...bySide.values()].filter((side) => side.total > 0 || side.vehicles.length > 0);
	}, [model, now, needle, callsignFor, playerName, roleName, vehicleName]);

	const followedGroup = useMemo(() => {
		const entity = follow !== null ? model.entities.get(follow) : undefined;
		if (!entity) return null;
		if (entity.kind !== 'man') return `vehicles:${entity.side ?? ''}`;
		return entity.groups.get(segmentAt(model, now)) ?? null;
	}, [model, follow, now]);

	// The list follows the followed unit, without moving the page around it.
	useEffect(() => {
		const list = listRef.current;
		const row = followedRef.current;
		if (!list || !row) return;
		// The list is positioned, so offsets inside it are measured from its top.
		const top = row.offsetTop;
		if (top < list.scrollTop + 40 || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
			list.scrollTop = top - list.clientHeight / 3;
		}
	}, [follow]);

	const toggle = (key: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	const isOpen = (key: string) => needle !== '' || expanded.has(key) || key === followedGroup;
	const shown = sides.filter((side) => sideFilter === null || side.key === sideFilter);
	const columns = Math.min(3, Math.max(1, sides.length));

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-col gap-[8px] border-b border-[#1e1e1e] p-[12px]">
				<label className="relative block">
					<span className="sr-only">{t('searchUnits')}</span>
					<span className="pointer-events-none absolute left-[12px] top-[14px] flex text-neutral-400">
						<Icon.Search size={16} />
					</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t('searchUnits')}
						className="block h-[44px] w-full rounded-[4px] border border-[#666666] bg-[#1a1a1a] pl-[36px] pr-[12px] text-[13px] leading-[18px] text-neutral-100 placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--accent)]"
					/>
				</label>
				<div role="group" aria-label={t('filterSides')} className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
					{sides.map((side) => {
						const style = sideStyle(side.key);
						const active = sideFilter === side.key;
						const name = sideName(side.key);
						return (
							<button
								key={side.key}
								type="button"
								aria-pressed={active}
								aria-label={t('sideAlive', { side: name, alive: side.alive, total: side.total })}
								onClick={() => setSideFilter(active ? null : side.key)}
								className={
									'flex min-h-[56px] min-w-0 flex-col items-stretch gap-[2px] rounded-[4px] border px-[8px] py-[7px] text-left ' +
									(active ? 'border-[rgba(210,184,83,0.5)] bg-[rgba(210,184,83,0.12)]' : 'border-[#2c2c2c] bg-[#1a1a1a] hover:border-[#666666] hover:bg-[#242424]')
								}
							>
								<span className={'truncate text-[11px] font-semibold leading-[14px] ' + (active ? 'text-[color:var(--accent)]' : 'text-neutral-300')}>{name}</span>
								<span className="text-[13px] font-semibold leading-[18px] tabular-nums text-neutral-100">
									{side.alive}
									<span className="font-medium text-neutral-400">/{side.total}</span>
								</span>
								<span className="block h-[3px] overflow-hidden rounded-[2px] bg-[#2c2c2c]">
									<span className="block h-[3px]" style={{ width: `${side.total ? (side.alive / side.total) * 100 : 0}%`, background: style.fill }} />
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-[8px] pb-[12px]">
				{shown.every((side) => side.squads.length === 0 && side.vehicles.length === 0) ? (
					<p className="px-[8px] py-[16px] text-[13px] leading-[18px] text-neutral-400">
						{needle !== '' ? t('noUnitMatches', { query: query.trim() }) : t('noUnits')}
					</p>
				) : null}
				{shown.map((side) => {
					const style = sideStyle(side.key);
					if (side.squads.length === 0 && side.vehicles.length === 0) return null;
					const vehiclesKey = `vehicles:${side.key}`;
					return (
						<section key={side.key} aria-label={sideName(side.key)}>
							<h3 className={`sticky top-0 z-[1] flex items-center justify-between gap-[8px] bg-[#121212] px-[8px] pb-[6px] pt-[12px] text-neutral-400 ${eyebrow}`}>
								<span className="flex min-w-0 items-center gap-[6px] text-neutral-300">
									<DiamondGlyph style={style} />
									<span className="truncate">{sideName(side.key)}</span>
								</span>
								<span className="shrink-0 tabular-nums">{t('aliveOf', { alive: side.alive, total: side.total })}</span>
							</h3>
							{side.squads.map((squad) => {
								const open = isOpen(squad.key);
								const members = needle !== '' && squad.matched.length > 0 && !squad.callsign.toLocaleLowerCase().includes(needle) ? squad.matched : squad.members;
								return (
									<div key={squad.key}>
										<GroupRow
											name={squad.callsign}
											open={open}
											states={squad.members.map((member) => member.life)}
											style={style}
											glyph="squad"
											onToggle={() => toggle(squad.key)}
										/>
										{open ? (
											<ul>
												{members.map((member) => {
													const seat = valueAt(member.entity.seats, now, null);
													const died = member.life === 'dead' ? member.entity.life[member.entity.life.length - 1]?.t : null;
													const detail = [member.role];
													if (member.life === 'unconscious') detail.push(t('unconscious'));
													if (member.life === 'dead') detail.push(t('killedAt', { time: formatMissionTime(died ?? now) }));
													else if (seat) detail.push(t('inVehicle', { vehicle: vehicleName(seat.vehicle), role: t(`seat_${seat.role}`) }));
													const followed = member.entity.eid === follow;
													return (
														<li key={member.entity.eid}>
															<UnitRow
																ref={followed ? followedRef : undefined}
																glyph={member.life === 'dead' ? <DeadGlyph /> : member.life === 'unconscious' ? <UnconsciousGlyph style={style} /> : <DotGlyph style={style} />}
																name={member.player ?? t('ai')}
																muted={member.life === 'dead' || member.player === null}
																detail={detail.join(' · ')}
																followed={followed}
																followingLabel={t('following')}
																onClick={() => onFollow(member.entity.eid)}
															/>
														</li>
													);
												})}
											</ul>
										) : null}
									</div>
								);
							})}
							{side.vehicles.length > 0 ? (
								<div>
									<GroupRow
										name={t('vehicles')}
										open={isOpen(vehiclesKey)}
										states={side.vehicles.map((vehicle) => (vehicle.wreck ? 'dead' : 'alive'))}
										style={style}
										glyph="vehicle"
										onToggle={() => toggle(vehiclesKey)}
									/>
									{isOpen(vehiclesKey) ? (
										<ul>
											{side.vehicles.map((vehicle) => {
												const destroyed = vehicle.wreck ? vehicle.entity.life[vehicle.entity.life.length - 1]?.t : null;
												const followed = vehicle.entity.eid === follow;
												return (
													<li key={vehicle.entity.eid}>
														<UnitRow
															ref={followed ? followedRef : undefined}
															glyph={<VehicleGlyph style={vehicle.wreck ? DEAD_STYLE : style} size={14} />}
															name={vehicle.name}
															muted={vehicle.wreck}
															detail={
																vehicle.wreck
																	? t('destroyedAt', { time: formatMissionTime(destroyed ?? now) })
																	: vehicle.crew > 0
																		? t('aboard', { count: vehicle.crew })
																		: t('empty')
															}
															followed={followed}
															followingLabel={t('following')}
															onClick={() => onFollow(vehicle.entity.eid)}
														/>
													</li>
												);
											})}
										</ul>
									) : null}
								</div>
							) : null}
						</section>
					);
				})}
			</div>
		</div>
	);
}

function GroupRow({
	name,
	open,
	states,
	style,
	glyph,
	onToggle,
}: {
	name: string;
	open: boolean;
	states: Life[];
	style: SideStyle;
	glyph: 'squad' | 'vehicle';
	onToggle: () => void;
}) {
	const t = useTranslations('replayViewer');
	const alive = states.filter((state) => state !== 'dead').length;
	return (
		<button
			type="button"
			aria-expanded={open}
			onClick={onToggle}
			className="flex min-h-[44px] w-full items-center gap-[8px] rounded-[4px] px-[8px] py-[4px] text-left hover:bg-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]"
		>
			<span className="flex text-neutral-400">{open ? <Icon.ChevronDown size={16} /> : <Icon.ChevronRight size={16} />}</span>
			{glyph === 'vehicle' ? <VehicleGlyph style={style} /> : <SquadGlyph style={style} />}
			<span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[18px] text-neutral-100">{name}</span>
			{states.length <= 10 ? (
				<span aria-hidden="true" className="flex gap-[3px]">
					{states.map((state, i) => (
						<span
							key={i}
							className="size-[6px] rounded-full"
							style={
								state === 'dead'
									? { background: '#4d4d4d' }
									: state === 'unconscious'
										? { background: '#ffffff', boxShadow: `inset 0 0 0 1.5px ${style.fill}` }
										: { background: style.fill }
							}
						/>
					))}
				</span>
			) : null}
			<span className="min-w-[28px] text-right text-[12px] font-semibold leading-[16px] tabular-nums text-neutral-300">
				{alive}/{states.length}
				<span className="sr-only"> {t('alive')}</span>
			</span>
		</button>
	);
}

function UnitRow({
	ref,
	glyph,
	name,
	muted,
	detail,
	followed,
	followingLabel,
	onClick,
}: {
	ref?: Ref<HTMLButtonElement>;
	glyph: ReactNode;
	name: string;
	muted: boolean;
	detail: string;
	followed: boolean;
	followingLabel: string;
	onClick: () => void;
}) {
	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={followed}
			onClick={onClick}
			className={
				'flex min-h-[44px] w-full items-center gap-[10px] rounded-[4px] py-[4px] pl-[34px] pr-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)] ' +
				(followed ? 'bg-[rgba(210,184,83,0.12)] shadow-[inset_0_0_0_1px_rgba(210,184,83,0.5)]' : 'hover:bg-[#1a1a1a]')
			}
		>
			{glyph}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={'truncate text-[13px] font-semibold leading-[18px] ' + (muted ? 'text-neutral-400' : 'text-neutral-100')}>{name}</span>
				<span className="truncate text-[12px] leading-[16px] text-neutral-400">{detail}</span>
			</span>
			{followed ? <span className={`shrink-0 text-[color:var(--accent)] ${eyebrow}`}>{followingLabel}</span> : null}
		</button>
	);
}
