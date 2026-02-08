import type { ContentSettings } from '../domain/types';
import type { GetContentSettingsDeps } from '../ports';

const FALLBACK_SETTINGS: ContentSettings = {
	upcomingGames: {
		enabled: false,
		startsAt: null,
		text: {
			en: '',
			ru: '',
			uk: '',
			ar: ''
		}
	}
};

export function getContentSettings(deps: GetContentSettingsDeps): ContentSettings {
	try {
		return deps.repo.getContentSettings();
	} catch {
		return FALLBACK_SETTINGS;
	}
}
