import type { ReactNode } from 'react';

export function AdminDisclosure({
	summaryLeft,
	summaryRight,
	children
}: {
	summaryLeft: ReactNode;
	summaryRight?: ReactNode;
	children: ReactNode;
}) {
	return (
		<details className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm shadow-black/20">
			<summary className="flex cursor-pointer list-none flex-col gap-2 [&::-webkit-details-marker]:hidden [&::marker]:hidden sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">{summaryLeft}</div>
				<div className="flex flex-wrap items-center gap-2">
					{summaryRight}
					<svg
						viewBox="0 0 20 20"
						fill="currentColor"
						className="h-4 w-4 text-neutral-500"
						aria-hidden="true"
					>
						<path
							fillRule="evenodd"
							d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
							clipRule="evenodd"
						/>
					</svg>
				</div>
			</summary>
			<div className="mt-4">{children}</div>
		</details>
	);
}
