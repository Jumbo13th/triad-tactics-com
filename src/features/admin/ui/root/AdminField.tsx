import type { ReactNode } from 'react';

export function AdminField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid gap-2 rounded-xl border border-neutral-900 bg-neutral-950/40 p-3">
			<p className="text-xs font-semibold tracking-wide text-neutral-400">{label}</p>
			<div className="text-neutral-200">{children}</div>
		</div>
	);
}
