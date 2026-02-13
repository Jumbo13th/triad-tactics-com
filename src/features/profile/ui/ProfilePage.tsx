'use client';

import DiscordLinkGate from '@/features/discordAuth/ui/DiscordLinkGate';
import { ProfileField } from "@/features/profile/ui/ProfileField";
import { ProfileLoading } from "@/features/profile/ui/ProfileLoading";
import { ProfileNotAuthorized } from "@/features/profile/ui/ProfileNotAuthorized";
import { useProfileData } from "@/features/profile/ui/useProfileData";
import { useTranslations } from "next-intl";

export default function ProfilePage() {
	const profileData = useProfileData();
	const t = useTranslations('profile');

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
					{profileData.items && profileData.items.map((item) => <ProfileField label={item.label} value={item.value} key={item.value} />)}
				</div>
			</div>
		</section>
	);
}
