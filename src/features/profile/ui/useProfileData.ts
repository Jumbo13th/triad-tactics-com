import {useUserStatus} from "@/features/users/ui/useUserStatus";
import {useTranslations} from "next-intl";
import {ProfileData} from "@/features/profile/types";

export const useProfileData = (): ProfileData => {
    const status = useUserStatus();
    const t = useTranslations('profile');

    if(!status) {
        return null;
    }

    if(!status.connected) {
        return { connected: false };
    }

    const accessLevel = t(`access.${status.accessLevel}`);
    const discordStatus = status.discordId ? t('values.discordLinked') : t('values.discordNotLinked');
    const formatValue = (value: string | null) => value ?? t('values.missing');
    const yesNo = (value: boolean) => (value ? t('values.yes') : t('values.no'));

    return {
        connected: true,
        items: [
            {
                label: t('fields.personaName'),
                value: formatValue(status.personaName),
            },
            {
                label: t('fields.callsign'),
                value: formatValue(status.currentCallsign),
            },
            {
                label: t('fields.steamId'),
                value: status.steamid64,
            },
            {
                label: t('fields.accessLevel'),
                value: accessLevel,
            },
            {
                label: t('fields.discord'),
                value: discordStatus,
            },
            {
                label: t('fields.playerConfirmed'),
                value: yesNo(status.playerConfirmed),
            },
            {
                label: t('fields.renameRequired'),
                value: yesNo(status.renameRequired),
            }
        ]
    }
}
