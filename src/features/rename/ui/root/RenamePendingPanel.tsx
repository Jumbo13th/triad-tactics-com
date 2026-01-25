export function RenamePendingPanel({
	title,
	text,
	successText,
	showSuccess,
	successLinkLabel,
	successLinkHref
}: {
	title: string;
	text: string;
	successText: string;
	showSuccess: boolean;
	successLinkLabel?: string;
	successLinkHref?: string;
}) {
	return (
		<div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
			<h3 className="text-sm font-semibold text-neutral-50">{title}</h3>
			<p className="mt-1 text-sm text-neutral-300">{text}</p>
			{showSuccess ? (
				<div className="mt-3 grid gap-2">
					<p className="text-sm text-emerald-300">{successText}</p>
					{successLinkLabel && successLinkHref ? (
						<a
							href={successLinkHref}
							className="text-sm font-medium text-[color:var(--accent)] hover:underline"
						>
							{successLinkLabel}
						</a>
					) : null}
				</div>
			) : null}
		</div>
	);
}
