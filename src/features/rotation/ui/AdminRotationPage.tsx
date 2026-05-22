'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useParams } from 'next/navigation';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';
import { AdminButton, AdminGate, AdminSurface, AdminToolbar } from '@/features/admin/ui/root';
import type { Rotation, RotationSide, RotationUnitEntry, AvailableUnit } from '../domain/types';

const inputClass = 'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-50 placeholder-neutral-500 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 [&::-webkit-calendar-picker-indicator]:invert';
const selectClass = 'block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 shadow-sm focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20';
const sectionClass = 'grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 shadow-sm shadow-black/20';
const cardClass = 'grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center';

function buildLocalizedPath(locale: string, pathname: string) {
	const suffix = pathname === '/' ? '' : pathname;
	return `/${locale}${suffix}`;
}

function parseRotationResponse(input: unknown): Rotation | null {
	if (!input || typeof input !== 'object') return null;
	const r = input as Record<string, unknown>;
	if (!r.config || !Array.isArray(r.sideA) || !Array.isArray(r.sideB)) return null;
	return input as Rotation;
}

type TFn = ReturnType<typeof useTranslations<'admin'>>;

function SideNamesSection({
	rotation,
	onSaved,
	ta
}: {
	rotation: Rotation;
	onSaved: (r: Rotation) => void;
	ta: TFn;
}) {
	const [sideAName, setSideAName] = useState(rotation.config.sideAName);
	const [sideBName, setSideBName] = useState(rotation.config.sideBName);
	const [sideAColor, setSideAColor] = useState(rotation.config.sideAColor);
	const [sideBColor, setSideBColor] = useState(rotation.config.sideBColor);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

	useEffect(() => {
		setSideAName(rotation.config.sideAName);
		setSideBName(rotation.config.sideBName);
		setSideAColor(rotation.config.sideAColor);
		setSideBColor(rotation.config.sideBColor);
	}, [rotation.config.sideAName, rotation.config.sideBName, rotation.config.sideAColor, rotation.config.sideBColor]);

	const save = async () => {
		setSaving(true);
		setFeedback(null);
		try {
			const res = await fetch('/api/admin/rotation', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'updateConfig', sideAName: sideAName.trim(), sideBName: sideBName.trim(), sideAColor, sideBColor })
			});
			const json: unknown = await res.json();
			if (res.ok) {
				const parsed = parseRotationResponse(json);
				if (parsed) onSaved(parsed);
				setFeedback({ tone: 'success', text: ta('rotationSaved') });
			} else {
				setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
			}
		} catch {
			setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className={sectionClass}>
			<div>
				<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('rotationSideNames')}</h2>
				<p className="mt-1 text-sm text-neutral-400">{ta('rotationSideNamesDescription')}</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<label className="grid gap-2 text-sm text-neutral-200">
					<span>{ta('rotationSideALabel')}</span>
					<div className="flex gap-2">
						<input type="color" value={sideAColor} onChange={(e) => setSideAColor(e.target.value)} className="h-[42px] w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-950 p-1" />
						<input type="text" value={sideAName} onChange={(e) => setSideAName(e.target.value)} className={inputClass} />
					</div>
				</label>
				<label className="grid gap-2 text-sm text-neutral-200">
					<span>{ta('rotationSideBLabel')}</span>
					<div className="flex gap-2">
						<input type="color" value={sideBColor} onChange={(e) => setSideBColor(e.target.value)} className="h-[42px] w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-950 p-1" />
						<input type="text" value={sideBName} onChange={(e) => setSideBName(e.target.value)} className={inputClass} />
					</div>
				</label>
			</div>
			<div>
				<AdminButton variant="primary" onClick={() => { void save(); }} disabled={saving || !sideAName.trim() || !sideBName.trim()}>
					{ta('rotationSaveNames')}
				</AdminButton>
			</div>
			{feedback && (
				<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>{feedback.text}</p>
			)}
		</section>
	);
}

function UnitCard({
	unit,
	onRemove,
	ta
}: {
	unit: RotationUnitEntry;
	onRemove?: () => void;
	ta: TFn;
}) {
	return (
		<div className={cardClass}>
			<div className="grid gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="text-base font-semibold text-neutral-50">[{unit.unitTag}] {unit.unitName}</p>
				</div>
				<div className="flex flex-wrap gap-3 text-sm text-neutral-400">
					<span>{ta('rotationSlots', { count: unit.slotsAllocated })}</span>
					<span>{unit.leaderCallsign ? ta('rotationLeader', { callsign: unit.leaderCallsign }) : ta('rotationNoLeader')}</span>
				</div>
			</div>
			{onRemove && (
				<div>
					<AdminButton variant="secondary" onClick={onRemove}>
						{ta('rotationRemoveUnit')}
					</AdminButton>
				</div>
			)}
		</div>
	);
}

function UnitAssignmentsSection({
	rotation,
	onSaved,
	ta
}: {
	rotation: Rotation;
	onSaved: (r: Rotation) => void;
	ta: TFn;
}) {
	const [sideA, setSideA] = useState<RotationUnitEntry[]>(rotation.sideA);
	const [sideB, setSideB] = useState<RotationUnitEntry[]>(rotation.sideB);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

	useEffect(() => {
		setSideA(rotation.sideA);
		setSideB(rotation.sideB);
	}, [rotation.sideA, rotation.sideB]);

	const assignedIds = useMemo(() => {
		const ids = new Set<number>();
		for (const u of sideA) ids.add(u.unitId);
		for (const u of sideB) ids.add(u.unitId);
		return ids;
	}, [sideA, sideB]);

	const available = useMemo(() => {
		const allAvailable = [...rotation.availableUnits];
		const allOriginal = [...rotation.sideA, ...rotation.sideB];
		for (const u of allOriginal) {
			if (!assignedIds.has(u.unitId) && !allAvailable.some((a) => a.unitId === u.unitId)) {
				allAvailable.push({ unitId: u.unitId, unitTag: u.unitTag, unitName: u.unitName, slotsAllocated: u.slotsAllocated, leaderCallsign: u.leaderCallsign });
			}
		}
		return allAvailable.filter((u) => !assignedIds.has(u.unitId));
	}, [rotation.availableUnits, rotation.sideA, rotation.sideB, assignedIds]);

	const addToSide = (unit: AvailableUnit, side: RotationSide) => {
		if (sideA.some((u) => u.unitId === unit.unitId) || sideB.some((u) => u.unitId === unit.unitId)) return;
		const entry: RotationUnitEntry = { ...unit, side, position: side === 'a' ? sideA.length : sideB.length };
		if (side === 'a') setSideA((prev) => [...prev, entry]);
		else setSideB((prev) => [...prev, entry]);
	};

	const removeFromSide = (unitId: number, side: RotationSide) => {
		if (side === 'a') setSideA((prev) => prev.filter((u) => u.unitId !== unitId));
		else setSideB((prev) => prev.filter((u) => u.unitId !== unitId));
	};

	const save = async () => {
		setSaving(true);
		setFeedback(null);
		try {
			const res = await fetch('/api/admin/rotation', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'updateSides', sideA: sideA.map((u) => u.unitId), sideB: sideB.map((u) => u.unitId) })
			});
			const json: unknown = await res.json();
			if (res.ok) {
				const parsed = parseRotationResponse(json);
				if (parsed) onSaved(parsed);
				setFeedback({ tone: 'success', text: ta('rotationSaved') });
			} else {
				const err = json && typeof json === 'object' && 'error' in json ? (json as { error: string }).error : '';
				if (err === 'duplicate_unit') setFeedback({ tone: 'error', text: ta('rotationErrorDuplicate') });
				else if (err === 'invalid_unit') setFeedback({ tone: 'error', text: ta('rotationErrorInvalidUnit') });
				else setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
			}
		} catch {
			setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className={sectionClass}>
			<div>
				<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('rotationUnitsTitle')}</h2>
				<p className="mt-1 text-sm text-neutral-400">{ta('rotationUnitsDescription')}</p>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<SideColumn label={rotation.config.sideAName} units={sideA} available={available} side="a" onAdd={addToSide} onRemove={removeFromSide} ta={ta} />
				<SideColumn label={rotation.config.sideBName} units={sideB} available={available} side="b" onAdd={addToSide} onRemove={removeFromSide} ta={ta} />
			</div>
			{feedback && (
				<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>{feedback.text}</p>
			)}
			<div>
				<AdminButton variant="primary" onClick={() => { void save(); }} disabled={saving}>
					{ta('rotationSaveAssignments')}
				</AdminButton>
			</div>
		</section>
	);
}

function SideColumn({
	label,
	units,
	available,
	side,
	onAdd,
	onRemove,
	ta
}: {
	label: string;
	units: RotationUnitEntry[];
	available: AvailableUnit[];
	side: RotationSide;
	onAdd: (unit: AvailableUnit, side: RotationSide) => void;
	onRemove: (unitId: number, side: RotationSide) => void;
	ta: TFn;
}) {
	const [selectedId, setSelectedId] = useState<string>('');

	const handleAdd = () => {
		const id = parseInt(selectedId, 10);
		const unit = available.find((u) => u.unitId === id);
		if (unit) {
			onAdd(unit, side);
			setSelectedId('');
		}
	};

	const totalSlots = units.reduce((sum, u) => sum + u.slotsAllocated, 0);

	return (
		<div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
			<div className="mb-3 flex items-center justify-between">
				<h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">{label}</h3>
				{units.length > 0 && (
					<span className="inline-flex items-center rounded-full border border-neutral-800 bg-white/5 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-300">
						{ta('rotationTotalSlots', { count: totalSlots })}
					</span>
				)}
			</div>
			{units.length === 0 ? (
				<p className="text-sm text-neutral-500">{ta('rotationNoUnitsAssigned')}</p>
			) : (
				<div className="grid gap-3">
					{units.map((u) => (
						<UnitCard key={u.unitId} unit={u} onRemove={() => onRemove(u.unitId, side)} ta={ta} />
					))}
				</div>
			)}
			{available.length > 0 ? (
				<div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
					<select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={selectClass}>
						<option value="">{ta('rotationAddUnit')}</option>
						{available.map((u) => (
							<option key={u.unitId} value={u.unitId}>[{u.unitTag}] {u.unitName}</option>
						))}
					</select>
					<AdminButton variant="secondary" onClick={handleAdd} disabled={!selectedId}>
						{ta('rotationAddUnit')}
					</AdminButton>
				</div>
			) : units.length > 0 ? (
				<p className="mt-3 text-xs text-neutral-500">{ta('rotationNoAvailableUnits')}</p>
			) : null}
		</div>
	);
}

type LocalPair = {
	key: number;
	sideAUnitId: string;
	sideBUnitId: string;
	scheduledDate: string;
};

function pairsFromSchedule(schedule: Rotation['commanderSchedule'], nextKey: { current: number }): LocalPair[] {
	return schedule.map((p) => ({
		key: nextKey.current++,
		sideAUnitId: String(p.sideAUnitId),
		sideBUnitId: String(p.sideBUnitId),
		scheduledDate: p.scheduledDate,
	}));
}

function CommanderScheduleSection({
	rotation,
	onSaved,
	ta
}: {
	rotation: Rotation;
	onSaved: (r: Rotation) => void;
	ta: TFn;
}) {
	const nextKeyRef = useRef(1);
	const [pairs, setPairs] = useState<LocalPair[]>(() => pairsFromSchedule(rotation.commanderSchedule, nextKeyRef));
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
	const scheduleRef = useRef(rotation.commanderSchedule);

	useEffect(() => {
		if (scheduleRef.current !== rotation.commanderSchedule) {
			scheduleRef.current = rotation.commanderSchedule;
			setPairs(pairsFromSchedule(rotation.commanderSchedule, nextKeyRef));
		}
	}, [rotation.commanderSchedule]);

	const addPair = () => {
		setPairs((prev) => {
			let defaultDate = '';
			const lastDate = [...prev].reverse().find((p) => p.scheduledDate)?.scheduledDate;
			if (lastDate) {
				const [y, m, d] = lastDate.split('-').map(Number);
				const next = new Date(y, m - 1, d + 7);
				defaultDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
			}
			return [...prev, { key: nextKeyRef.current++, sideAUnitId: '', sideBUnitId: '', scheduledDate: defaultDate }];
		});
	};

	const removePair = (key: number) => {
		setPairs((prev) => prev.filter((p) => p.key !== key));
	};

	const updatePair = (key: number, field: keyof Omit<LocalPair, 'key'>, value: string) => {
		setPairs((prev) => prev.map((p) => p.key === key ? { ...p, [field]: value } : p));
	};

	const canSave = pairs.every((p) => p.sideAUnitId && p.sideBUnitId && p.scheduledDate);

	const save = async () => {
		setSaving(true);
		setFeedback(null);
		try {
			const res = await fetch('/api/admin/rotation', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'updateCommanderSchedule',
					pairs: pairs.map((p) => ({
						sideAUnitId: parseInt(p.sideAUnitId, 10),
						sideBUnitId: parseInt(p.sideBUnitId, 10),
						scheduledDate: p.scheduledDate,
					})),
				})
			});
			const json: unknown = await res.json();
			if (res.ok) {
				const parsed = parseRotationResponse(json);
				if (parsed) onSaved(parsed);
				setFeedback({ tone: 'success', text: ta('rotationSaved') });
			} else {
				const err = json && typeof json === 'object' && 'error' in json ? (json as { error: string }).error : '';
				if (err === 'unit_not_on_side') setFeedback({ tone: 'error', text: ta('rotationErrorUnitNotOnSide') });
				else setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
			}
		} catch {
			setFeedback({ tone: 'error', text: ta('rotationErrorSave') });
		} finally {
			setSaving(false);
		}
	};

	const hasSideUnits = rotation.sideA.length > 0 && rotation.sideB.length > 0;

	return (
		<section className={sectionClass}>
			<div>
				<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{ta('rotationCommanderTitle')}</h2>
				<p className="mt-1 text-sm text-neutral-400">{ta('rotationCommanderDescription')}</p>
			</div>

			{!hasSideUnits ? (
				<p className="text-sm text-neutral-500">{ta('rotationCommanderEmpty')}</p>
			) : (
				<>
					{pairs.length === 0 ? (
						<p className="text-sm text-neutral-500">{ta('rotationCommanderEmpty')}</p>
					) : (
						<div className="grid gap-3">
							{pairs.map((pair) => (
								<div key={pair.key} className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,160px)_auto] md:items-end">
									<label className="grid gap-2 text-sm text-neutral-200">
										<span>{ta('rotationSideACommander')}</span>
										<select
											value={pair.sideAUnitId}
											onChange={(e) => updatePair(pair.key, 'sideAUnitId', e.target.value)}
											className={selectClass}
										>
											<option value="">—</option>
											{rotation.sideA.map((u) => (
												<option key={u.unitId} value={u.unitId}>[{u.unitTag}] {u.unitName}</option>
											))}
										</select>
									</label>
									<label className="grid gap-2 text-sm text-neutral-200">
										<span>{ta('rotationSideBCommander')}</span>
										<select
											value={pair.sideBUnitId}
											onChange={(e) => updatePair(pair.key, 'sideBUnitId', e.target.value)}
											className={selectClass}
										>
											<option value="">—</option>
											{rotation.sideB.map((u) => (
												<option key={u.unitId} value={u.unitId}>[{u.unitTag}] {u.unitName}</option>
											))}
										</select>
									</label>
									<label className="grid gap-2 text-sm text-neutral-200">
										<span>{ta('rotationScheduledDate')}</span>
										<input
											type="date"
											value={pair.scheduledDate}
											onChange={(e) => updatePair(pair.key, 'scheduledDate', e.target.value)}
											className={inputClass}
										/>
									</label>
									<AdminButton variant="secondary" onClick={() => removePair(pair.key)}>
										{ta('rotationRemovePair')}
									</AdminButton>
								</div>
							))}
						</div>
					)}

					<div className="flex flex-wrap items-center gap-3">
						<AdminButton variant="secondary" onClick={addPair}>
							{ta('rotationAddPair')}
						</AdminButton>
						<AdminButton variant="primary" onClick={() => { void save(); }} disabled={saving || !canSave}>
							{ta('rotationSaveSchedule')}
						</AdminButton>
					</div>
				</>
			)}

			{feedback && (
				<p className={feedback.tone === 'success' ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>{feedback.text}</p>
			)}
		</section>
	);
}

export default function AdminRotationPage() {
	const ta = useTranslations('admin');
	const pathname = usePathname();
	const params = useParams();
	const locale = (params.locale as string) || 'en';
	const redirectPath = useMemo(() => buildLocalizedPath(locale, pathname), [locale, pathname]);

	const [status, setStatus] = useState<AdminStatus | null>(null);
	const [rotation, setRotation] = useState<Rotation | null>(null);
	const [loadError, setLoadError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = await res.json();
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!status?.connected || !status?.isAdmin) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/rotation', { cache: 'no-store' });
				const json: unknown = await res.json();
				const parsed = parseRotationResponse(json);
				if (!cancelled) {
					if (parsed) {
						setRotation(parsed);
						setLoadError(false);
					} else {
						setLoadError(true);
					}
				}
			} catch {
				if (!cancelled) setLoadError(true);
			}
		})();
		return () => { cancelled = true; };
	}, [status]);

	const onSaved = (r: Rotation) => setRotation(r);

	return (
		<AdminSurface>
			<AdminGate status={status} redirectPath={redirectPath} t={ta}>
				<div className="grid gap-6">
					<AdminToolbar title={ta('rotationTitle')} />
					<p className="text-sm text-neutral-300">{ta('rotationSubtitle')}</p>

					{loadError && (
						<p className="text-sm text-red-300">{ta('rotationErrorSave')}</p>
					)}

					{rotation && (
						<>
							<SideNamesSection rotation={rotation} onSaved={onSaved} ta={ta} />
							<UnitAssignmentsSection rotation={rotation} onSaved={onSaved} ta={ta} />
							<CommanderScheduleSection rotation={rotation} onSaved={onSaved} ta={ta} />
						</>
					)}

					{!rotation && !loadError && (
						<p className="text-sm text-neutral-300">{ta('loading')}</p>
					)}
				</div>
			</AdminGate>
		</AdminSurface>
	);
}
