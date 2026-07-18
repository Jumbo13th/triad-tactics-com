'use client';

import { useState } from 'react';
import { thNum, thText } from './tableStyles';

export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; dir: SortDir };

/** One sort state can drive several tables — the per-side scoreboards share it. */
export function useSortState<K extends string>(initial: SortState<K>, defaultDir: Record<K, SortDir>) {
	const [sort, setSort] = useState<SortState<K>>(initial);

	function toggle(key: K) {
		setSort((current) =>
			current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir[key] }
		);
	}

	return { sort, toggle };
}

export function sortRows<K extends string, Row>(
	rows: Row[],
	sort: SortState<K>,
	valueOf: (row: Row, key: K) => number | string,
	tiebreak?: (a: Row, b: Row) => number
): Row[] {
	const copy = rows.slice();
	copy.sort((a, b) => {
		const va = valueOf(a, sort.key);
		const vb = valueOf(b, sort.key);
		let cmp: number;
		if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
		else cmp = Number(va) - Number(vb);
		if (cmp === 0 && tiebreak) cmp = tiebreak(a, b);
		return sort.dir === 'asc' ? cmp : -cmp;
	});
	return copy;
}

export function SortHeader<K extends string>({
	label,
	sortKey,
	sort,
	onToggle,
	numeric = true,
	className = '',
}: {
	label: string;
	sortKey: K;
	sort: SortState<K>;
	onToggle: (key: K) => void;
	numeric?: boolean;
	className?: string; // e.g. sticky-column classes
}) {
	const active = sort.key === sortKey;
	return (
		<th className={`${numeric ? thNum : thText} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
			<button
				type="button"
				onClick={() => onToggle(sortKey)}
				className={`inline-flex items-center gap-1 uppercase transition ${
					active ? 'text-[color:var(--accent)]' : 'hover:text-neutral-300'
				}`}
			>
				{label}
				<span className={`text-[9px] leading-none ${active ? '' : 'opacity-30'}`} aria-hidden="true">
					{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
				</span>
			</button>
		</th>
	);
}
