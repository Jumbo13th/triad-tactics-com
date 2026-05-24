'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CanonicalSlotting, CanonicalSlot } from '@/features/games/domain/slotting';
import { parseAdminGameMissionResponse } from '@/features/games/domain/api';
import type { AdminGameMissionDetail } from '@/features/games/domain/api';
import { sideDisplayName } from '@/features/games/domain/slotting';
import type { GameUnitAssignment } from '@/features/games/domain/types';
import {
	SLOTTING_INDEX_COLUMN_REM,
	SLOTTING_SQUAD_COLUMN_REM,
	buildSideRows,
	slotCellSurfaceClass,
	slotBadgeClass,
	slottingTableWidthRem
} from './missionPageUtils';
import { SyncedHorizontalScroll } from './missionPageComponents';

const ACCESS_VALUES: Array<CanonicalSlot['access']> = ['unit', 'priority', 'regular'];

type Props = {
	slotting: CanonicalSlotting;
	slottingRevision: number;
	unitAssignments: GameUnitAssignment[];
	missionId: number;
	episodeNumber: number;
	onSaved: (mission: AdminGameMissionDetail) => void;
};

export function SlottingEditor({ slotting, slottingRevision, unitAssignments, missionId, episodeNumber, onSaved }: Props) {
	const tg = useTranslations('games');
	const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
	const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const saveSlotChange = async (slotId: string, updater: (slot: CanonicalSlot) => void) => {
		const next = structuredClone(slotting);
		for (const side of next.sides) {
			for (const squad of side.squads) {
				for (const slot of squad.slots) {
					if (slot.id === slotId) {
						updater(slot);
					}
				}
			}
		}

		setSavingSlotId(slotId);
		setError(null);
		try {
			const res = await fetch(`/api/admin/games/${missionId}/slotting`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					episodeNumber,
					slottingRevision,
					slotting: next,
					confirmDestructive: true
				})
			});
			const json: unknown = await res.json();
			const parsed = parseAdminGameMissionResponse(json);
			if (!parsed || 'error' in parsed) {
				setError(parsed && 'error' in parsed ? parsed.error : 'Unknown error');
			} else {
				onSaved(parsed.mission);
			}
		} catch {
			setError(tg('adminSlottingEditorNetworkError'));
		} finally {
			setSavingSlotId(null);
		}
	};

	return (
		<div className="grid gap-4">
			{error ? (
				<div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
					<span>{error}</span>
					<button type="button" onClick={() => setError(null)} className="text-xs font-semibold text-red-300 hover:text-red-100">{tg('adminSlottingEditorDismiss')}</button>
				</div>
			) : null}

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

						<SyncedHorizontalScroll contentWidthRem={boardWidthRem}>
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
											<th key={squad.id} className="border-b border-neutral-800 bg-neutral-950/80 px-3 py-3 text-left align-bottom">
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

												const isEditing = editingSlotId === slot.id;
												const isSaving = savingSlotId === slot.id;

												return (
													<td key={slot.id} className={`border-t border-neutral-800 p-2 align-top ${isEditing ? 'relative z-20 overflow-visible' : ''}`}>
														<div
															className={`relative flex min-h-32 cursor-pointer flex-col rounded-2xl border p-3 shadow-sm shadow-black/10 transition-colors ${
																isSaving
																	? 'opacity-60'
																	: isEditing
																		? 'border-[color:var(--accent)]/50 ring-1 ring-[color:var(--accent)]/30'
																		: 'hover:border-neutral-600'
															} ${slotCellSurfaceClass(slot.access)}`}
															onClick={() => setEditingSlotId(isEditing ? null : slot.id)}
														>
															<p className="whitespace-normal break-words text-xs font-semibold leading-snug text-neutral-50 [overflow-wrap:anywhere]">
																{slot.role}
															</p>
															<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
																<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${slotBadgeClass(slot.access)}`}>
																	{slot.access}
																</span>
															</div>
															<p className="mt-1.5 truncate text-sm font-medium text-neutral-400">
																{slot.occupant
																	? slot.occupant.type === 'user' ? slot.occupant.callsign : slot.occupant.label
																	: tg('slotUnclaimed')}
															</p>

															{isEditing ? (
																<div
																	className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-[color:var(--accent)]/30 bg-neutral-950 p-3 shadow-xl shadow-black/40"
																	onClick={(e) => e.stopPropagation()}
																>
																	<div className="grid gap-3">
																		<div>
																			<label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{tg('adminSlottingEditorAccessLabel')}</label>
																			<div className="mt-1.5 flex flex-wrap gap-1.5">
																				{ACCESS_VALUES.map((accessValue) => (
																					<button
																						key={accessValue}
																						type="button"
																						disabled={isSaving}
																						onClick={() => {
																							void saveSlotChange(slot.id, (s) => {
																								s.access = accessValue;
																								if (accessValue !== 'unit' && s.occupant?.type === 'placeholder') {
																									s.occupant = null;
																								}
																							});
																						}}
																						className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase transition ${
																							slot.access === accessValue
																								? 'bg-[color:var(--accent)] text-neutral-950'
																								: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
																						}`}
																					>
																						{tg(`slotAccess${accessValue.charAt(0).toUpperCase() + accessValue.slice(1)}` as 'slotAccessUnit' | 'slotAccessPriority' | 'slotAccessRegular')}
																					</button>
																				))}
																			</div>
																		</div>

																		{slot.access === 'unit' ? (
																			<div>
																				<label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{tg('adminSlottingEditorUnitLabel')}</label>
																				<select
																					disabled={isSaving}
																					value={slot.occupant?.type === 'placeholder' ? slot.occupant.label : ''}
																					onChange={(e) => {
																						const tag = e.target.value;
																						void saveSlotChange(slot.id, (s) => {
																							s.occupant = tag ? { type: 'placeholder', label: tag } : null;
																						});
																					}}
																					className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
																				>
																					<option value="">{tg('adminSlottingEditorSelectUnit')}</option>
																					{unitAssignments
																						.filter((ua) => ua.sideId === side.id && ua.episodeNumber === episodeNumber)
																						.map((ua) => (
																							<option key={ua.unitId} value={ua.unitTag}>
																								{ua.unitTag} ({ua.unitName})
																							</option>
																						))}
																				</select>
																			</div>
																		) : null}

																		{slot.occupant !== null ? (
																			<button
																				type="button"
																				disabled={isSaving}
																				onClick={() => {
																					void saveSlotChange(slot.id, (s) => {
																						s.occupant = null;
																					});
																				}}
																				className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
																			>
																				{tg('adminSlottingEditorClearOccupant')}
																			</button>
																		) : null}
																	</div>
																</div>
															) : null}
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
		</div>
	);
}
