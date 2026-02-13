import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type DiscordLinkButtonProps = {
	children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function DiscordLinkButton({
	children,
	className,
	...props
}: DiscordLinkButtonProps) {
	const base =
		'inline-flex items-center justify-center rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-black/30 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-60';

	return (
		<button type="button" className={base + (className ? ' ' + className : '')} {...props}>
			{children}
		</button>
	);
}
