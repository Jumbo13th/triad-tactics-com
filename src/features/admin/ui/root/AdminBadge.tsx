import type { ReactNode } from 'react';

export function AdminBadge({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
			{children}
		</span>
	);
}
