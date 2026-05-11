'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { useTranslations } from 'next-intl';
import type { CanonicalSlot } from '@/features/games/domain/slotting';
import {
	slotAccessLabel,
	slotBadgeClass,
	slotCellSurfaceClass,
	slotOccupantLabel
} from './missionPageUtils';

export function SyncedHorizontalScroll({
	contentWidthRem,
	children
}: {
	contentWidthRem: number;
	children: ReactNode;
}) {
	const topScrollerRef = useRef<HTMLDivElement | null>(null);
	const bottomScrollerRef = useRef<HTMLDivElement | null>(null);
	const activeSourceRef = useRef<'top' | 'bottom' | null>(null);
	const rafRef = useRef(0);

	const syncFrom = useCallback((source: 'top' | 'bottom') => {
		if (activeSourceRef.current !== null && activeSourceRef.current !== source) return;
		activeSourceRef.current = source;

		cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(() => {
			const src = source === 'top' ? topScrollerRef.current : bottomScrollerRef.current;
			const tgt = source === 'top' ? bottomScrollerRef.current : topScrollerRef.current;
			if (src && tgt) tgt.scrollLeft = src.scrollLeft;
			activeSourceRef.current = null;
		});
	}, []);

	const contentWidth = `max(100%, ${contentWidthRem}rem)`;

	return (
		<div className="px-2 pb-2 pt-3">
			<div
				ref={topScrollerRef}
				onScroll={() => syncFrom('top')}
				className="overflow-x-auto overflow-y-hidden pb-1"
				aria-label="Top horizontal scroll"
			>
				<div className="relative h-1" style={{ width: contentWidth }} />
			</div>

			<div
				ref={bottomScrollerRef}
				onScroll={() => syncFrom('bottom')}
				className="overflow-x-auto"
			>
				<div style={{ width: contentWidth }}>{children}</div>
			</div>
		</div>
	);
}

export function ConnectionSegment({
	value,
	label,
	accent = false,
	mono = false,
	copyValue,
	copyLabel,
	copiedLabel
}: {
	value: ReactNode;
	label: string;
	accent?: boolean;
	mono?: boolean;
	copyValue?: string | null;
	copyLabel?: string;
	copiedLabel?: string;
}) {
	const [copied, setCopied] = useState(false);
	const resetCopyTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (resetCopyTimeoutRef.current !== null) {
				window.clearTimeout(resetCopyTimeoutRef.current);
			}
		};
	}, []);

	const handleCopy = async () => {
		if (!copyValue) return;
		if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

		try {
			await navigator.clipboard.writeText(copyValue);
			setCopied(true);
			if (resetCopyTimeoutRef.current !== null) {
				window.clearTimeout(resetCopyTimeoutRef.current);
			}
			resetCopyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1_500);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div
			className={
				'group relative overflow-hidden rounded-2xl border px-3 py-2 sm:px-4 sm:py-3 ' +
				(accent
					? 'border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10'
					: 'border-neutral-800 bg-neutral-950/70')
			}
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(210,184,83,0.15),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
			<div className="relative grid gap-1.5">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-xs">{label}</span>
					{copyValue && copyLabel && copiedLabel ? (
						<button
							type="button"
							onClick={() => { void handleCopy(); }}
							className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-300 transition hover:bg-white/10 hover:text-neutral-100"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
								<path d="M6 2.75A1.75 1.75 0 0 0 4.25 4.5v8.75c0 .966.784 1.75 1.75 1.75h7.25A1.75 1.75 0 0 0 15 13.25V4.5A1.75 1.75 0 0 0 13.25 2.75H6Z" />
								<path d="M3.5 6A.75.75 0 0 1 4.25 6.75v8A1.75 1.75 0 0 0 6 16.5h6.75a.75.75 0 0 1 0 1.5H6A3.25 3.25 0 0 1 2.75 14.75v-8A.75.75 0 0 1 3.5 6Z" />
							</svg>
							{copied ? copiedLabel : copyLabel}
						</button>
					) : null}
				</div>
				<span className={`break-all text-lg font-semibold text-neutral-50 sm:text-xl ${mono ? 'font-mono tracking-[0.05em]' : ''}`}>
					{value}
				</span>
			</div>
		</div>
	);
}

export function CountdownSegment({ value, label }: { value: string; label: string }) {
	return (
		<div className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 sm:px-4 sm:py-3">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(210,184,83,0.15),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
			<div className="relative flex items-center justify-between gap-3">
				<span className="text-2xl font-semibold text-neutral-50 sm:text-3xl">{value}</span>
				<span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 sm:text-xs">{label}</span>
			</div>
		</div>
	);
}

export function SlotCell({
	slot,
	isHeldByViewer,
	canClaim,
	canSwitch,
	canLeave,
	isBusy,
	isLeaveBusy,
	disableActions,
	onClaim,
	onSwitch,
	onLeave,
	unitClaim,
	t
}: {
	slot: CanonicalSlot;
	isHeldByViewer: boolean;
	canClaim: boolean;
	canSwitch: boolean;
	canLeave: boolean;
	isBusy: boolean;
	isLeaveBusy: boolean;
	disableActions: boolean;
	onClaim: () => void;
	onSwitch: () => void;
	onLeave: () => void;
	unitClaim?: { canClaim: boolean; canRelease: boolean; isBusy: boolean; unitTag: string; onClaim: () => void; onRelease: () => void } | null;
	t: ReturnType<typeof useTranslations<'games'>>;
}) {
	const isOwnUnit = unitClaim?.canRelease;

	return (
		<div className={`flex min-h-40 flex-col justify-between rounded-2xl border p-3 shadow-sm shadow-black/10 ${
			isOwnUnit
				? 'border-emerald-500/30 bg-emerald-950/40'
				: slotCellSurfaceClass(slot.access)
		}`}>
			<div>
				<p
					className="whitespace-normal break-words text-xs font-semibold leading-snug text-neutral-50 [overflow-wrap:anywhere]"
					title={slot.role}
				>
					{slot.role}
				</p>
				<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
					<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${slotBadgeClass(slot.access)}`}>
						{slotAccessLabel(slot.access, t)}
					</span>
					{isHeldByViewer ? (
						<span className="inline-flex items-center rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
							{t('yourSlot')}
						</span>
					) : null}
					{isOwnUnit ? (
						<span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
							{unitClaim!.unitTag}
						</span>
					) : null}
				</div>
				<p className="mt-1.5 truncate text-sm font-medium text-neutral-100" title={slotOccupantLabel(slot.occupant, t)}>
					{slotOccupantLabel(slot.occupant, t)}
				</p>
			</div>

			{canClaim ? (
				<button
					type="button"
					disabled={disableActions}
					onClick={onClaim}
					className="mt-2 inline-flex w-fit items-center whitespace-nowrap rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isBusy ? t('actionWorking') : t('claimSlot')}
				</button>
			) : null}

			{canSwitch ? (
				<button
					type="button"
					disabled={disableActions}
					onClick={onSwitch}
					className="mt-2 inline-flex w-fit items-center whitespace-nowrap rounded-lg border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)] transition hover:bg-[color:var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isBusy ? t('actionWorking') : t('switchHere')}
				</button>
			) : null}

			{canLeave ? (
				<button
					type="button"
					disabled={disableActions}
					onClick={onLeave}
					className="mt-2 inline-flex w-fit items-center whitespace-nowrap rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isLeaveBusy ? t('actionWorking') : t('leaveSlot')}
				</button>
			) : null}

			{unitClaim?.canClaim ? (
				<button
					type="button"
					disabled={disableActions}
					onClick={unitClaim.onClaim}
					className="mt-2 inline-flex w-fit items-center whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{unitClaim.isBusy ? t('actionWorking') : t('unitSlottingClaim', { tag: unitClaim.unitTag })}
				</button>
			) : null}

			{unitClaim?.canRelease ? (
				<button
					type="button"
					disabled={disableActions}
					onClick={unitClaim.onRelease}
					className="mt-2 inline-flex w-fit items-center whitespace-nowrap rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{unitClaim.isBusy ? t('actionWorking') : t('unitSlottingRelease')}
				</button>
			) : null}
		</div>
	);
}
