import { getContentSettings, upsertContentSettings } from './infra/sqliteContentSettings';
import type { GetContentSettingsDeps, UpdateContentSettingsDeps } from './ports';

export const getContentSettingsDeps: GetContentSettingsDeps = {
	repo: {
		getContentSettings
	}
};

export const updateContentSettingsDeps: UpdateContentSettingsDeps = {
	repo: {
		upsertContentSettings
	}
};
