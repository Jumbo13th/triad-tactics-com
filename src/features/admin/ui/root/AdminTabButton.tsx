import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function AdminTabButton({
	active,
	children,
	className,
	...props
}: { active: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			className={
				'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 ' +
				(active
					? 'bg-[color:var(--accent)] text-neutral-950'
					: 'bg-white/10 text-neutral-50 hover:bg-white/20') +
				(className ? ' ' + className : '')
			}
			{...props}
		>
			{children}
		</button>
	);
}
