'use client';

import { useEffect, useState } from 'react';
import DiscordLinkGate from '@/features/discordAuth/ui/DiscordLinkGate';
import { ProfileField } from "@/features/profile/ui/ProfileField";
import { ProfileLoading } from "@/features/profile/ui/ProfileLoading";
import { ProfileNotAuthorized } from "@/features/profile/ui/ProfileNotAuthorized";
import { useProfileData } from "@/features/profile/ui/useProfileData";
import { useTranslations } from "next-intl";
import { Link } from '@/i18n/routing';

export default function ProfilePage() {
	const profileData = useProfileData();
	const t = useTranslations('profile');
	const tu = useTranslations('units');
	const [userUnit, setUserUnit] = useState<{ id: number; name: string; tag: string } | null>(null);

	useEffect(() => {
		fetch('/api/units/my')
			.then(r => { if (r.ok) return r.json(); return null; })
			.then(data => { if (data?.unit) setUserUnit(data.unit); })
			.catch(() => {});
	}, []);

	if (!profileData) {
		return (
			<ProfileLoading />
		);
	}

	if (!profileData.connected) {
		return (
			<ProfileNotAuthorized />
		);
	}

	return (
		<section className="grid gap-6">
			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-2">
						<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h2>
						<p className="text-sm text-neutral-300 sm:text-base">{t('subtitle')}</p>
					</div>
					<DiscordLinkGate />
				</div>

				<div className="mt-6 grid gap-4 sm:grid-cols-2">
					{profileData.items && profileData.items.map((item) => <ProfileField label={item.label} value={item.value} key={item.label} />)}
				</div>

				{profileData.badges && profileData.badges.length > 0 ? (
					<div className="mt-6">
						<p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('badgesLabel')}</p>
						<div className="mt-3 flex flex-wrap gap-2">
							{profileData.badges.map((badge) => (
								<span
									key={badge.label}
									className="inline-flex items-center rounded-2xl border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1.5 text-sm font-semibold text-neutral-50"
								>
									{badge.label}
								</span>
							))}
						</div>
					</div>
				) : null}

				{userUnit && (
					<div className="mt-6">
						<p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{tu('title')}</p>
						<div className="mt-3">
							<Link
								href={`/units/${userUnit.tag}`}
								className="inline-flex items-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 transition hover:border-[color:var(--accent)]/35"
							>
								<span className="inline-flex items-center rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2.5 py-1 text-xs font-bold tracking-widest text-[color:var(--accent)]">
									{userUnit.tag}
								</span>
								<span className="text-sm font-semibold text-neutral-50">{userUnit.name}</span>
							</Link>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
