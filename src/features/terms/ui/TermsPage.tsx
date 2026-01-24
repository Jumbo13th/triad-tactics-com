'use client';

import { useTranslations } from 'next-intl';

export default function TermsPage() {
	const t = useTranslations('terms');
	const responsibilityList = [
		t('sections.responsibility.list.1'),
		t('sections.responsibility.list.2'),
		t('sections.responsibility.list.3'),
		t('sections.responsibility.list.4')
	];
	const prohibitedList = [
		t('sections.prohibited.list.1'),
		t('sections.prohibited.list.2'),
		t('sections.prohibited.list.3'),
		t('sections.prohibited.list.4'),
		t('sections.prohibited.list.5'),
		t('sections.prohibited.list.6'),
		t('sections.prohibited.list.7'),
		t('sections.prohibited.list.8'),
		t('sections.prohibited.list.9')
	];
	const liabilityList = [
		t('sections.liability.list.1'),
		t('sections.liability.list.2')
	];

	return (
		<section className="text-sm text-neutral-200">
			<div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-6 shadow-sm shadow-black/20 sm:px-6">
				<div className="space-y-8">
					<div className="space-y-3">
						<h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">
							{t('title')}
						</h1>
						<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
							{t('updatedAt')}
						</p>
						<p className="text-neutral-300">{t('intro.1')}</p>
						<p className="text-neutral-300">{t('intro.2')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.acceptance.title')}</h2>
						<p className="text-neutral-300">{t('sections.acceptance.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.eligibility.title')}</h2>
						<p className="text-neutral-300">{t('sections.eligibility.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.milsim.title')}</h2>
						<p className="text-neutral-300">{t('sections.milsim.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.responsibility.title')}</h2>
						<p className="text-neutral-300">{t('sections.responsibility.body')}</p>
						<ul className="list-disc space-y-2 pl-5 text-neutral-300">
							{responsibilityList.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.prohibited.title')}</h2>
						<p className="text-neutral-300">{t('sections.prohibited.body')}</p>
						<ul className="list-disc space-y-2 pl-5 text-neutral-300">
							{prohibitedList.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.extremism.title')}</h2>
						<p className="text-neutral-300">{t('sections.extremism.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.moderation.title')}</h2>
						<p className="text-neutral-300">{t('sections.moderation.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.license.title')}</h2>
						<p className="text-neutral-300">{t('sections.license.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.ip.title')}</h2>
						<p className="text-neutral-300">{t('sections.ip.body')}</p>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.liability.title')}</h2>
						<p className="text-neutral-300">{t('sections.liability.body')}</p>
						<ul className="list-disc space-y-2 pl-5 text-neutral-300">
							{liabilityList.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>

					<div className="space-y-4">
						<h2 className="text-lg font-semibold text-neutral-100">{t('sections.changes.title')}</h2>
						<p className="text-neutral-300">{t('sections.changes.body')}</p>
					</div>
				</div>
			</div>
		</section>
	);
}
