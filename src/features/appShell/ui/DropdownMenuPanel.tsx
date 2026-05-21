'use client';

import type { ReactNode } from 'react';

export function DropdownMenuPanel({
	children,
	className
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			role="menu"
			className={
				'absolute left-0 z-20 mt-3 min-w-52 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/30 ' +
				(className ?? '')
			}
		>
			<div className="grid gap-1">{children}</div>
		</div>
	);
}
