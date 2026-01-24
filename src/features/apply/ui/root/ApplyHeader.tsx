export function ApplyHeader({ title, subtitle }: { title: string; subtitle?: string }) {
	return (
		<div className="mb-6">
			<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{title}</h2>
			{subtitle ? <p className="mt-1 text-base text-neutral-300">{subtitle}</p> : null}
		</div>
	);
}
