import { useTranslations } from 'next-intl';
import ApplicationForm from '@/features/apply/ui/ApplicationForm';
import SteamSignInButton from '@/features/steamAuth/ui/SteamSignInButton';

export default function ApplyPage(props: { steamConnected: boolean; locale: string }) {
  const tf = useTranslations('form');

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{tf('title')}</h2>
        {props.steamConnected && (
          <p className="mt-1 text-base text-neutral-300">{tf('subtitle')}</p>
        )}
      </div>

      {props.steamConnected ? (
        <ApplicationForm initialSteamConnected={props.steamConnected} />
      ) : (
        <div id="steam-auth" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-base font-medium text-neutral-200">{tf('steamAuth.title')}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{tf('steamAuth.help')}</p>

              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                <p className="text-sm font-medium text-neutral-200">{tf('steamAuth.detect.title')}</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-300">
                  <li>{tf('steamAuth.detect.profilePublic')}</li>
                  <li>{tf('steamAuth.detect.gameDetailsPublic')}</li>
                  <li>{tf('steamAuth.detect.gameNotHidden')}</li>
                  <li>{tf('steamAuth.detect.delayAfterChange')}</li>
                  <li>{tf('steamAuth.detect.canRehideAfterSubmit')}</li>
                </ul>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{tf('steamAuth.detect.incognitoCheck')}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-base text-neutral-300">{tf('steamAuth.clickToConnect')}</span>
              <SteamSignInButton
                redirectPath={`/${props.locale}/apply`}
                ariaLabel={tf('steamAuth.connect')}
                size="large"
                imageClassName="h-11 w-auto"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
