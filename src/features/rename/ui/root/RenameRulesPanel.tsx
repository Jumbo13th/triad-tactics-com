export function RenameRulesPanel({ title, intro, rules }: { title: string; intro: string; rules: string[] }) {
	return (
		<div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4">
			<p className="text-sm font-medium text-neutral-100">{title}</p>
			<p className="mt-1 text-sm text-neutral-300">{intro}</p>
			<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
				{rules.map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
		</div>
	);
}
