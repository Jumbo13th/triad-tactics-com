// Shared table vocabulary: text columns left, numeric columns centered with
// tabular digits, everything single-line for uniform row heights.

export const thText =
	'whitespace-nowrap border-b border-neutral-800 px-3 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500';
export const thNum =
	'whitespace-nowrap border-b border-neutral-800 px-3 py-3 text-center align-middle text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500';
export const tdText = 'whitespace-nowrap border-t border-neutral-800 px-3 py-2.5 align-middle text-sm';
export const tdNum = 'whitespace-nowrap border-t border-neutral-800 px-3 py-2.5 text-center align-middle text-sm tabular-nums';

export function fmt1(value: number): string {
	return value.toFixed(1);
}

export function fmtMult(value: number): string {
	return `×${value.toFixed(2)}`;
}
