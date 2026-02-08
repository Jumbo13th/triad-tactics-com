import type { ContentSettings } from './domain/types';

export type ReadContentRepo = {
	getContentSettings: () => ContentSettings;
};

export type WriteContentRepo = {
	upsertContentSettings: (
		settings: ContentSettings,
		updatedBy: string
	) => { success: true } | { success: false; error: 'database_error' };
};

export type GetContentSettingsDeps = {
	repo: ReadContentRepo;
};

export type UpdateContentSettingsDeps = {
	repo: WriteContentRepo;
};
