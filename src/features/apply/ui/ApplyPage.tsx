import { useTranslations } from 'next-intl';
import { ApplicationForm, ApplyHeader, ApplySteamGate, ApplySurface } from '@/features/apply/ui/root';

export default function ApplyPage(props: { steamConnected: boolean; locale: string }) {
  const tf = useTranslations('form');

  return (
    <ApplySurface>
      <ApplyHeader title={tf('title')} subtitle={props.steamConnected ? tf('subtitle') : undefined} />

      {props.steamConnected ? (
        <ApplicationForm initialSteamConnected={props.steamConnected} />
      ) : (
        <ApplySteamGate t={tf} locale={props.locale} />
      )}
    </ApplySurface>
  );
}
