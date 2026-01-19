import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function AdminButton({
	variant,
	children,
	className,
	...props
}: {
	variant: 'primary' | 'secondary';
	children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
	const base =
		'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold shadow-sm shadow-black/30 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60';
	const styles =
		variant === 'primary'
			? ' bg-[color:var(--accent)] text-neutral-950 hover:opacity-95'
			: ' bg-white/10 text-neutral-50 hover:bg-white/15';

	return (
		<button type="button" className={base + styles + (className ? ' ' + className : '')} {...props}>
			{children}
		</button>
	);
}
