import type { ReactNode } from 'react';

export function AdminToolbar({
	title,
	countText,
	actions
}: {
	title: string;
	countText?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{title}</h2>
				{countText ? <p className="text-sm text-neutral-400">{countText}</p> : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</div>
	);
}
