'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { segmentAt, valueAt, type Entity, type Life, type ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';
import { DeadGlyph, DiamondGlyph, DotGlyph, Icon, SquadGlyph, UnconsciousGlyph, VehicleGlyph } from './glyphs';
import { DEAD_STYLE, type SideStyle } from './sideStyle';

type Props = {
	model: ReplayModel;
	/** Whole seconds of mission time, so the list redraws at most once a second. */
	second: number;
	selected: number | null;
	following: boolean;
	sideName: (key: string) => string;
	sideStyle: (side: string | null) => SideStyle;
	callsignFor: (groupKey: string) => string;
	nicknameOf: (entity: Entity) => string | null;
	roleName: (entity: Entity) => string;
	vehicleName: (eid: number) => string;
	onPick: (eid: number) => void;
};

type Member = { entity: Entity; life: Life; nickname: string | null; role: string };
type Squad = { key: string; callsign: string; members: Member[]; matched: Member[] };
type Vehicle = { entity: Entity; name: string; wreck: boolean; crew: number };
type SideView = { key: string; alive: number; total: number; squads: Squad[]; vehicles: Vehicle[] };

const eyebrow = 'text-[11px] font-semibold uppercase leading-[14px] tracking-[0.08em]';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--accent)]';

function present(entity: Entity, now: number): boolean {
	if (entity.appearedAt > now) return false;
	// A body the game cleared away still counts as one of its squad's dead.
	return entity.removedAt === null || entity.removedAt > now || valueAt(entity.life, entity.removedAt, 'alive') === 'dead';
}

export default function UnitsPanel(props: Props) {
	const { model, second, selected, following, sideName, sideStyle, callsignFor, nicknameOf, roleName, vehicleName, onPick } = props;
	const t = useTranslations('replayViewer');
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
	const [closedSides, setClosedSides] = useState<ReadonlySet<string>>(() => new Set());
	const listRef = useRef<HTMLDivElement>(null);
	const pickedRef = useRef<HTMLButtonElement>(null);
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
				squad = { key: group.key, callsign: callsignFor(group.key), members: [], matched: [] };
				squads.set(group.key, squad);
				side.squads.push(squad);
			}
			const member = { entity, life, nickname: nicknameOf(entity), role: roleName(entity) };
			squad.members.push(member);
			if (matches(member.nickname) || matches(member.role)) squad.matched.push(member);
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
	}, [model, now, needle, callsignFor, nicknameOf, roleName, vehicleName]);

	const pickedGroup = useMemo(() => {
		const entity = selected !== null ? model.entities.get(selected) : undefined;
		if (!entity) return null;
		if (entity.kind !== 'man') return `vehicles:${entity.side ?? ''}`;
		return entity.groups.get(segmentAt(model, now)) ?? null;
	}, [model, selected, now]);
	const pickedSide = selected !== null ? (model.entities.get(selected)?.side ?? null) : null;

	// The list keeps the picked unit in view, without moving the page around it.
	useEffect(() => {
		const list = listRef.current;
		const row = pickedRef.current;
		if (!list || !row) return;
		// The list is positioned, so offsets inside it are measured from its top.
		const top = row.offsetTop;
		if (top < list.scrollTop + 40 || top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 3;
	}, [selected]);

	const flip = (set: ReadonlySet<string>, key: string) => {
		const next = new Set(set);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		return next;
	};
	const isOpen = (key: string) => needle !== '' || open.has(key) || key === pickedGroup;
	const sideOpen = (key: string) => needle !== '' || !closedSides.has(key) || key === pickedSide;
	const empty = sides.every((side) => side.squads.length === 0 && side.vehicles.length === 0);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-[#1e1e1e] p-[10px]">
				<label className="relative block">
					<span className="sr-only">{t('searchUnits')}</span>
					<span className="pointer-events-none absolute left-[10px] top-[12px] flex text-neutral-400">
						<Icon.Search size={16} />
					</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t('searchUnits')}
						className="block h-[40px] w-full rounded-[4px] border border-[#2c2c2c] bg-[#1a1a1a] pl-[34px] pr-[10px] text-[13px] leading-[18px] text-neutral-100 placeholder:text-neutral-500 hover:border-[#666666] focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--accent)]"
					/>
				</label>
			</div>

			<div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-[6px] pb-[12px]">
				{empty ? (
					<p className="px-[8px] py-[16px] text-[13px] leading-[18px] text-neutral-400">{needle !== '' ? t('noUnitMatches', { query: query.trim() }) : t('noUnits')}</p>
				) : null}
				{sides.map((side) => {
					if (side.squads.length === 0 && side.vehicles.length === 0) return null;
					const style = sideStyle(side.key);
					const expanded = sideOpen(side.key);
					const vehiclesKey = `vehicles:${side.key}`;
					return (
						<section key={side.key} aria-label={sideName(side.key)}>
							<h3 className="sticky top-0 z-[1] bg-[#121212] pt-[6px]">
								<button
									type="button"
									aria-expanded={expanded}
									onClick={() => setClosedSides((current) => flip(current, side.key))}
									className={`flex min-h-[36px] w-full items-center gap-[6px] rounded-[4px] px-[6px] text-left hover:bg-[#1a1a1a] ${focusRing}`}
								>
									<span className="flex text-neutral-500">{expanded ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}</span>
									<DiamondGlyph style={style} />
									<span className={`min-w-0 flex-1 truncate text-neutral-300 ${eyebrow}`}>{sideName(side.key)}</span>
									<span className="shrink-0 text-[12px] font-semibold tabular-nums text-neutral-400">
										{side.alive}/{side.total}
										<span className="sr-only"> {t('alive')}</span>
									</span>
								</button>
							</h3>
							{expanded ? (
								<>
									{side.squads.map((squad) => {
										const squadOpen = isOpen(squad.key);
										const members = needle !== '' && squad.matched.length > 0 && !squad.callsign.toLocaleLowerCase().includes(needle) ? squad.matched : squad.members;
										const alive = squad.members.filter((member) => member.life !== 'dead').length;
										return (
											<div key={squad.key}>
												<GroupRow
													name={squad.callsign}
													open={squadOpen}
													alive={alive}
													total={squad.members.length}
													glyph={<SquadGlyph style={style} size={14} />}
													onToggle={() => setOpen((current) => flip(current, squad.key))}
												/>
												{squadOpen ? (
													<ul>
														{members.map((member) => {
															const seat = valueAt(member.entity.seats, now, null);
															const died = member.life === 'dead' ? member.entity.life[member.entity.life.length - 1]?.t : null;
															const detail = member.nickname ? [member.role] : [];
															if (member.life === 'unconscious') detail.push(t('unconscious'));
															if (member.life === 'dead') detail.push(t('killedAt', { time: formatMissionTime(died ?? now) }));
															else if (seat) detail.push(t('inVehicle', { vehicle: vehicleName(seat.vehicle), role: t(`seat_${seat.role}`) }));
															const picked = member.entity.eid === selected;
															return (
																<li key={member.entity.eid}>
																	<UnitRow
																		ref={picked ? pickedRef : undefined}
																		glyph={
																			member.life === 'dead' ? (
																				<DeadGlyph size={10} />
																			) : member.life === 'unconscious' ? (
																				<UnconsciousGlyph style={style} size={10} />
																			) : (
																				<DotGlyph style={style} size={10} />
																			)
																		}
																		name={member.nickname ?? member.role}
																		muted={member.life === 'dead' || member.nickname === null}
																		detail={detail.join(' · ')}
																		picked={picked}
																		following={picked && following}
																		followingLabel={t('following')}
																		onClick={() => onPick(member.entity.eid)}
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
												alive={side.vehicles.filter((vehicle) => !vehicle.wreck).length}
												total={side.vehicles.length}
												glyph={<VehicleGlyph style={style} size={14} />}
												onToggle={() => setOpen((current) => flip(current, vehiclesKey))}
											/>
											{isOpen(vehiclesKey) ? (
												<ul>
													{side.vehicles.map((vehicle) => {
														const destroyed = vehicle.wreck ? vehicle.entity.life[vehicle.entity.life.length - 1]?.t : null;
														const picked = vehicle.entity.eid === selected;
														return (
															<li key={vehicle.entity.eid}>
																<UnitRow
																	ref={picked ? pickedRef : undefined}
																	glyph={<VehicleGlyph style={vehicle.wreck ? DEAD_STYLE : style} size={12} />}
																	name={vehicle.name}
																	muted={vehicle.wreck}
																	detail={
																		vehicle.wreck
																			? t('destroyedAt', { time: formatMissionTime(destroyed ?? now) })
																			: vehicle.crew > 0
																				? t('aboard', { count: vehicle.crew })
																				: t('empty')
																	}
																	picked={picked}
																	following={picked && following}
																	followingLabel={t('following')}
																	onClick={() => onPick(vehicle.entity.eid)}
																/>
															</li>
														);
													})}
												</ul>
											) : null}
										</div>
									) : null}
								</>
							) : null}
						</section>
					);
				})}
			</div>
		</div>
	);
}

function GroupRow({ name, open, alive, total, glyph, onToggle }: { name: string; open: boolean; alive: number; total: number; glyph: ReactNode; onToggle: () => void }) {
	const t = useTranslations('replayViewer');
	return (
		<button type="button" aria-expanded={open} onClick={onToggle} className={`flex min-h-[36px] w-full items-center gap-[8px] rounded-[4px] pl-[18px] pr-[6px] text-left hover:bg-[#1a1a1a] ${focusRing}`}>
			<span className="flex text-neutral-500">{open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}</span>
			{glyph}
			<span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[18px] text-neutral-100">{name}</span>
			<span className={'shrink-0 text-[12px] font-semibold tabular-nums ' + (alive === 0 ? 'text-neutral-500' : alive < total ? 'text-neutral-300' : 'text-neutral-400')}>
				{alive}/{total}
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
	picked,
	following,
	followingLabel,
	onClick,
}: {
	ref?: Ref<HTMLButtonElement>;
	glyph: ReactNode;
	name: string;
	muted: boolean;
	detail: string;
	picked: boolean;
	following: boolean;
	followingLabel: string;
	onClick: () => void;
}) {
	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={picked}
			onClick={onClick}
			className={
				`flex min-h-[36px] w-full items-center gap-[8px] rounded-[4px] py-[3px] pl-[44px] pr-[6px] text-left ${focusRing} ` +
				(picked ? 'bg-[rgba(210,184,83,0.12)] shadow-[inset_0_0_0_1px_rgba(210,184,83,0.5)]' : 'hover:bg-[#1a1a1a]')
			}
		>
			{glyph}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={'truncate text-[13px] font-semibold leading-[17px] ' + (muted ? 'text-neutral-400' : 'text-neutral-100')}>{name}</span>
				{detail ? <span className="truncate text-[12px] leading-[15px] text-neutral-500">{detail}</span> : null}
			</span>
			{following ? <span className={`shrink-0 text-[color:var(--accent)] ${eyebrow}`}>{followingLabel}</span> : null}
		</button>
	);
}
