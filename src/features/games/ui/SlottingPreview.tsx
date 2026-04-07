import { Fragment } from 'react';
import type { CanonicalSlotting } from '@/features/games/domain/slotting';
import { sideDisplayName } from '@/features/games/domain/slotting';
import {
	SLOTTING_INDEX_COLUMN_REM,
	SLOTTING_SQUAD_COLUMN_REM,
	buildSideRows,
	buildSlottingSummary,
	slotCellSurfaceClass,
	slotBadgeClass,
	slottingTableWidthRem
} from './missionPageUtils';
import { SyncedHorizontalScroll } from './missionPageComponents';

const ACCESS_LABELS: Record<string, string> = {
	unit: 'Unit',
	priority: 'Priority',
	regular: 'Regular'
};

export function SlottingPreview({ slotting }: { slotting: CanonicalSlotting }) {
	const summary = buildSlottingSummary(slotting, null);

	if (slotting.sides.length === 0) {
		return <p className="text-sm text-neutral-500">No sides defined.</p>;
	}

	return (
		<div className="grid gap-6">
			{slotting.sides.map((side) => {
				const sideRows = buildSideRows(side);
				const boardWidthRem = slottingTableWidthRem(side.squads.length);

				return (
					<section
						key={side.id}
						className="overflow-hidden rounded-2xl border bg-white/[0.02]"
						style={{ borderColor: `${side.color}55` }}
					>
						<div className="flex items-center gap-3 border-b border-neutral-800/80 px-4 py-3">
							<span className="h-3 w-3 rounded-full" style={{ backgroundColor: side.color }} />
							<h4 className="text-base font-semibold text-neutral-50">{sideDisplayName(side)}</h4>
						</div>

						<SyncedHorizontalScroll
							contentWidthRem={boardWidthRem}
						>
							<table className="table-fixed border-separate border-spacing-0" style={{ width: `${boardWidthRem}rem` }}>
								<colgroup>
									<col style={{ width: `${SLOTTING_INDEX_COLUMN_REM}rem` }} />
									{side.squads.map((squad) => (
										<col key={`col-${squad.id}`} style={{ width: `${SLOTTING_SQUAD_COLUMN_REM}rem` }} />
									))}
								</colgroup>
								<thead>
									<tr>
										<th className="sticky left-0 z-20 w-14 border-b border-r border-neutral-800 bg-neutral-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
											#
										</th>
										{side.squads.map((squad) => (
											<th key={squad.id} className="border-b border-neutral-800 bg-neutral-950/80 px-3 py-3 text-left align-bottom" style={{ scrollSnapAlign: 'start' }}>
												<div className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-300">{squad.name}</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{sideRows.map((row) => (
										<tr key={`${side.id}-${row.index}`}>
											<th className="sticky left-0 z-10 w-14 border-r border-t border-neutral-800 bg-neutral-950 px-3 py-4 text-left align-top text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
												{String(row.index + 1).padStart(2, '0')}
											</th>
											{row.slots.map((slot, squadIndex) => {
												if (!slot) {
													return (
														<td key={`${side.id}-${row.index}-${squadIndex}`} className="border-t border-neutral-800 p-2 align-top">
															<div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-black/10 text-lg text-neutral-700">
																-
															</div>
														</td>
													);
												}

												return (
													<td key={slot.id} className="border-t border-neutral-800 p-2 align-top">
														<div className={`flex min-h-32 flex-col rounded-2xl border p-3 shadow-sm shadow-black/10 ${slotCellSurfaceClass(slot.access)}`}>
															<p className="whitespace-normal break-words text-xs font-semibold leading-snug text-neutral-50 [overflow-wrap:anywhere]">
																{slot.role}
															</p>
															<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
																<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${slotBadgeClass(slot.access)}`}>
																	{ACCESS_LABELS[slot.access] ?? slot.access}
																</span>
															</div>
															<p className="mt-1.5 truncate text-sm font-medium text-neutral-400">
																{slot.occupant
																	? slot.occupant.type === 'user' ? slot.occupant.callsign : slot.occupant.label
																	: 'Unclaimed'}
															</p>
														</div>
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</SyncedHorizontalScroll>
					</section>
				);
			})}

			<div className="grid gap-3">
				<h4 className="text-sm font-semibold tracking-tight text-neutral-200">Summary</h4>
				<div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/70">
					<table className="min-w-[36rem] w-full border-separate border-spacing-0">
						<thead>
							<tr>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Side</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Squad</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit Slots</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Priority</th>
								<th className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Regular</th>
							</tr>
						</thead>
						<tbody>
							{summary.map((side) => (
								<Fragment key={side.sideId}>
									{side.squads.map((squad, i) => (
										<tr key={`${side.sideId}-${squad.squadId}`} className="odd:bg-white/[0.015]">
											{i === 0 ? (
												<td rowSpan={side.squads.length + 1} className="border-t border-neutral-800 px-3 py-2 align-top text-sm text-neutral-200">
													<span className="inline-flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: side.sideColor }} />
														{side.sideName}
													</span>
												</td>
											) : null}
											<td className="border-t border-neutral-800 px-3 py-2 text-sm font-semibold text-neutral-100">{squad.squadName}</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{squad.squadSlotTeams.length > 0
													? squad.squadSlotTeams.map((e) => `${e.team} × ${e.count}`).join(', ')
													: <span className="text-neutral-500">0</span>}
											</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{squad.priorityOpen} open / {squad.priorityTaken} taken
											</td>
											<td className="border-t border-neutral-800 px-3 py-2 text-sm text-neutral-200">
												{squad.regularOpen} open / {squad.regularTaken} taken
											</td>
										</tr>
									))}
									<tr key={`${side.sideId}-total`} className="bg-white/[0.04]">
										<td className="border-t border-neutral-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
											Total ({side.totalSlots})
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{side.squadSlotTeams.length > 0
												? side.squadSlotTeams.map((e) => `${e.team} × ${e.count}`).join(', ')
												: '0'}
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{side.prioritySlots} total / {side.priorityTaken} taken
										</td>
										<td className="border-t border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300">
											{side.regularSlots} total / {side.regularTaken} taken
										</td>
									</tr>
								</Fragment>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
