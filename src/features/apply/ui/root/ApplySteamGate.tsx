import { SteamSignInButton } from '@/features/steamAuth/ui/root';

type TFn = (key: string) => string;

export function ApplySteamGate({ t, locale }: { t: TFn; locale: string }) {
	return (
		<div id="steam-auth" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
			<div className="flex flex-col gap-4">
				<div>
					<p className="text-base font-medium text-neutral-200">{t('steamAuth.title')}</p>
					<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('steamAuth.help')}</p>

					<div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
						<p className="text-sm font-medium text-neutral-200">{t('steamAuth.detect.title')}</p>
						<ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
							<li>{t('steamAuth.detect.profilePublic')}</li>
							<li>{t('steamAuth.detect.gameDetailsPublic')}</li>
							<li>{t('steamAuth.detect.gameNotHidden')}</li>
							<li>{t('steamAuth.detect.delayAfterChange')}</li>
							<li>{t('steamAuth.detect.canRehideAfterSubmit')}</li>
						</ul>
						<p className="mt-2 text-sm leading-relaxed text-neutral-400">{t('steamAuth.detect.incognitoCheck')}</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<span className="text-base text-neutral-300">{t('steamAuth.clickToConnect')}</span>
					<SteamSignInButton
						redirectPath={`/${locale}/apply`}
						ariaLabel={t('steamAuth.connect')}
						size="large"
						imageClassName="h-11 w-auto"
					/>
				</div>
			</div>
		</div>
	);
}
