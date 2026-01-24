export function RenameReasonPanel({
	reasonLabel,
	reason,
	requestedByLabel,
	requestedBy
}: {
	reasonLabel: string;
	reason: string;
	requestedByLabel: string;
	requestedBy?: string | null;
}) {
	return (
		<div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
			<p className="text-sm font-medium text-neutral-100">{reasonLabel}</p>
			<p className="mt-1 text-sm text-neutral-300">{reason}</p>
			{requestedBy ? (
				<p className="mt-2 text-xs text-neutral-500">
					{requestedByLabel}: {requestedBy}
				</p>
			) : null}
		</div>
	);
}
