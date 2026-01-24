import Link from 'next/link';

export function RenameHeader({
	title,
	subtitle,
	backHref,
	backLabel,
	signedInAs
}: {
	title: string;
	subtitle: string;
	backHref: string;
	backLabel: string;
	signedInAs?: string | null;
}) {
	return (
		<>
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{title}</h2>
					<p className="mt-2 text-sm text-neutral-300">{subtitle}</p>
				</div>
				<Link
					href={backHref}
					className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
				>
					{backLabel}
				</Link>
			</div>
			{signedInAs ? (
				<p className="mt-2 text-xs text-neutral-500">{signedInAs}</p>
			) : null}
		</>
	);
}
