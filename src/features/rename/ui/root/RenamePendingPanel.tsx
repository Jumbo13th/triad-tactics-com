export function RenamePendingPanel({
	title,
	text,
	successText,
	showSuccess
}: {
	title: string;
	text: string;
	successText: string;
	showSuccess: boolean;
}) {
	return (
		<div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
			<h3 className="text-sm font-semibold text-neutral-50">{title}</h3>
			<p className="mt-1 text-sm text-neutral-300">{text}</p>
			{showSuccess ? <p className="mt-3 text-sm text-emerald-300">{successText}</p> : null}
		</div>
	);
}
