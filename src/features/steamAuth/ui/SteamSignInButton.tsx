'use client';

import { useMemo, useState } from 'react';

const STEAM_SIGNIN_IMAGE_LARGE =
	'https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_02.png';
const STEAM_SIGNIN_IMAGE_SMALL =
	'https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_01.png';

export type SteamSignInButtonProps = {
	redirectPath: string;
	ariaLabel: string;
	/**
	 * Visual size of the official Steam image button.
	 * - "small" uses sits_01
	 * - "large" uses sits_02
	 */
	size?: 'small' | 'large';
	className?: string;
	imageClassName?: string;
	/**
	 * Prevent rapid re-clicks by disabling briefly after the first click.
	 * Helps avoid double-starting the Steam auth flow.
	 */
	cooldownMs?: number;
};

export default function SteamSignInButton({
	redirectPath,
	ariaLabel,
	size = 'large',
	className,
	imageClassName,
	cooldownMs = 2500
}: SteamSignInButtonProps) {
	const src = size === 'small' ? STEAM_SIGNIN_IMAGE_SMALL : STEAM_SIGNIN_IMAGE_LARGE;
	const [busy, setBusy] = useState(false);
	const href = useMemo(
		() => `/api/auth/steam/start?redirect=${encodeURIComponent(redirectPath)}`,
		[redirectPath]
	);

	return (
		<button
			type="button"
			aria-label={ariaLabel}
			disabled={busy}
			className={
				className ??
				'inline-flex items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950'
			}
			onClick={() => {
				if (busy) return;
				setBusy(true);
				// Navigate immediately; cooldown is a best-effort guard for quick double-clicks.
				window.location.assign(href);
				window.setTimeout(() => setBusy(false), cooldownMs);
			}}
		>
			<span className="sr-only">{ariaLabel}</span>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={src}
				alt={ariaLabel}
				className={imageClassName ?? 'h-11 w-auto'}
			/>
		</button>
	);
}
