'use client';

import { Link } from '@/i18n/routing';
import { useUserStatus } from '@/features/users/ui/useUserStatus';
import { ProfileIcon } from "@/features/profile/ui/ProfileIcon";

export default function ProfileNavButton({userName}: { userName: string; }) {
	const status = useUserStatus();

	const isAuthorized =
		status?.connected && (status.accessLevel === 'player' || status.accessLevel === 'admin');

	if (!isAuthorized) return null;

	return (
		<Link
			href="/profile"
			className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-neutral-50 shadow-sm shadow-black/30 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-60"
		>
			<ProfileIcon />
			{userName}
		</Link>
	);
}
