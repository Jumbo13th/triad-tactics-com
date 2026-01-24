import type { ReactNode } from 'react';

export function ApplySurface({ children }: { children: ReactNode }) {
	return (
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
			{children}
		</section>
	);
}
