import type { ContentSettings } from '../domain/types';
import type { UpdateContentSettingsDeps } from '../ports';

export function updateContentSettings(
	deps: UpdateContentSettingsDeps,
	settings: ContentSettings,
	updatedBy: string
): { ok: true } | { ok: false; error: 'database_error' } {
	const result = deps.repo.upsertContentSettings(settings, updatedBy);
	if (result.success) return { ok: true };
	return { ok: false, error: 'database_error' };
}
