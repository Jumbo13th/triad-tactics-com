import { useTranslations } from 'next-intl';
import { CommunityLinks } from '@/features/welcome/ui/root';

export default function FeedPage() {
	const t = useTranslations('feed');

	return (
		<section className="grid gap-6">
			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
				<div className="space-y-3">
					<h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h2>
					<p className="text-sm text-neutral-300 sm:text-base">{t('subtitle')}</p>
				</div>
				<p className="mt-4 text-sm text-neutral-300 sm:text-base">{t('notice')}</p>
				<p className="mt-2 text-sm text-neutral-300 sm:text-base">{t('joinPrompt')}</p>
				<div className="mt-4 grid gap-3 lg:grid-cols-2">
					<CommunityLinks />
				</div>
			</div>
		</section>
	);
}
