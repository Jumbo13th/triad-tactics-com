'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { segmentAt, valueAt, type Entity, type ReplayModel } from '../../domain/replayFormat';
import { formatMissionTime } from './format';

type Props = {
	model: ReplayModel;
	/** Whole seconds of mission time, so the list redraws once a second. */
	second: number;
	follow: number | null;
	sideName: (key: string) => string;
	sideColor: (side: string | null) => string;
	callsignFor: (groupKey: string) => string;
	playerName: (eid: number, t: number) => string | null;
	roleName: (entity: Entity) => string;
	vehicleName: (eid: number) => string;
	onFollow: (eid: number) => void;
};

export default function UnitsPanel(props: Props) {
	const { model, second, follow, sideName, sideColor, callsignFor, playerName, roleName, vehicleName, onFollow } = props;
	const t = useTranslations('replayViewer');
	const [sideFilter, setSideFilter] = useState<string | null>(null);
	const now = second * 10;

	const view = useMemo(() => {
		const segment = segmentAt(model, now);
		const counts = new Map<string, { alive: number; total: number }>();
		const members = new Map<string, Entity[]>();
		for (const entity of model.entities.values()) {
			if (entity.kind !== 'man' || entity.appearedAt > now || (entity.removedAt !== null && entity.removedAt <= now)) continue;
			const side = entity.side ?? '';
			const count = counts.get(side) ?? { alive: 0, total: 0 };
			count.total++;
			if (valueAt(entity.life, now, 'alive') !== 'dead') count.alive++;
			counts.set(side, count);
			const group = entity.groups.get(segment);
			if (group) members.set(group, [...(members.get(group) ?? []), entity]);
		}
		const sideOrder = new Map(model.sides.map((side, i) => [side.key, i]));
		const groups = [...model.groups.values()]
			.filter((group) => group.segment === segment && members.has(group.key))
			.sort((a, b) => (sideOrder.get(a.side ?? '') ?? 99) - (sideOrder.get(b.side ?? '') ?? 99) || a.key.localeCompare(b.key));
		const sides = model.sides.filter((side) => counts.has(side.key));
		return { counts, members, groups, sides };
	}, [model, now]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3">
				{view.sides.map((side) => {
					const count = view.counts.get(side.key) ?? { alive: 0, total: 0 };
					const active = sideFilter === side.key;
					return (
						<button
							key={side.key}
							type="button"
							aria-pressed={active}
							onClick={() => setSideFilter(active ? null : side.key)}
							className={
								'flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold ' +
								(active ? 'border-[color:var(--accent)] bg-white/5 text-neutral-50' : 'border-neutral-800 text-neutral-300 hover:bg-white/5')
							}
						>
							<span className="flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-full" style={{ background: side.color }} />
								<span className="truncate">{sideName(side.key)}</span>
							</span>
							<span className="font-mono text-[13px] tabular-nums text-neutral-400">
								{count.alive}/{count.total}
							</span>
						</button>
					);
				})}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
				{view.groups
					.filter((group) => sideFilter === null || group.side === sideFilter)
					.map((group) => (
						<section key={group.key} className="mb-3">
							<h3 className="mb-1 flex items-center gap-2 px-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
								<span className="h-2 w-2 rotate-45" style={{ background: sideColor(group.side) }} />
								{callsignFor(group.key)}
							</h3>
							<ul className="grid gap-0.5">
								{(view.members.get(group.key) ?? []).map((entity) => {
									const life = valueAt(entity.life, now, 'alive');
									const seat = valueAt(entity.seats, now, null);
									const player = playerName(entity.eid, now);
									const role = roleName(entity);
									const died = life === 'dead' ? entity.life[entity.life.length - 1]?.t : null;
									const detail =
										life === 'dead'
											? t('killedAt', { time: formatMissionTime(died ?? now) })
											: life === 'unconscious'
												? t('unconscious')
												: seat
													? t('inVehicle', { vehicle: vehicleName(seat.vehicle), role: t(`seat_${seat.role}`) })
													: null;
									const followed = entity.eid === follow;
									return (
										<li key={entity.eid}>
											<button
												type="button"
												onClick={() => onFollow(entity.eid)}
												aria-pressed={followed}
												className={
													'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left ' +
													(followed ? 'bg-white/10 ring-1 ring-[color:var(--accent)]' : 'hover:bg-white/5')
												}
											>
												{life === 'dead' ? (
													<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
														<path d="M1 1l8 8M9 1l-8 8" stroke="#737b86" strokeWidth="2" />
													</svg>
												) : (
													<span
														className="h-2.5 w-2.5 shrink-0 rounded-full"
														style={
															life === 'unconscious'
																? { boxShadow: `inset 0 0 0 2px ${sideColor(entity.side)}` }
																: { background: sideColor(entity.side), opacity: player ? 1 : 0.7 }
														}
													/>
												)}
												<span className="flex min-w-0 flex-1 flex-col">
													<span
														className={
															'truncate text-[13px] font-semibold ' +
															(life === 'dead' ? 'text-neutral-500 line-through' : player ? 'text-neutral-100' : 'text-neutral-400')
														}
													>
														{player ?? t('ai')}
													</span>
													<span className={'truncate text-[11px] ' + (life === 'unconscious' ? 'text-amber-300' : 'text-neutral-400')}>
														{detail ? `${role} · ${detail}` : role}
													</span>
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					))}
			</div>
		</div>
	);
}
