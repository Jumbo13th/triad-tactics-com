import { getDb } from '@/platform/db/connection';
import type { AppLocale } from '@/i18n/locales';
import { appLocales } from '@/i18n/locales';
import type { ContentSettings } from '@/features/content/domain/types';

const SETTING_KEYS = {
	upcomingGamesEnabled: 'content_upcoming_games_enabled',
	upcomingGamesStartsAt: 'content_upcoming_games_starts_at',
	upcomingGamesTextPrefix: 'content_upcoming_games_text_'
} as const;

const DEFAULT_TEXTS: Record<AppLocale, string> = {
	en: '',
	ru: '',
	uk: '',
	ar: ''
};

function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
	if (value == null) return defaultValue;
	return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function buildTextKey(locale: AppLocale): string {
	return `${SETTING_KEYS.upcomingGamesTextPrefix}${locale}`;
}

export function getContentSettings(): ContentSettings {
	const db = getDb();
	const keys = [
		SETTING_KEYS.upcomingGamesEnabled,
		SETTING_KEYS.upcomingGamesStartsAt,
		...appLocales.map(buildTextKey)
	];
	const placeholders = keys.map(() => '?').join(', ');
	const stmt = db.prepare(`
		SELECT key, value
		FROM content_settings
		WHERE key IN (${placeholders})
	`);

	const rows = stmt.all(...keys) as Array<{ key: string; value: string | null }>;
	const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

	const text: Record<AppLocale, string> = { ...DEFAULT_TEXTS };
	for (const locale of appLocales) {
		const value = map.get(buildTextKey(locale));
		if (typeof value === 'string') text[locale] = value;
	}

	return {
		upcomingGames: {
			enabled: parseBoolean(map.get(SETTING_KEYS.upcomingGamesEnabled), false),
			startsAt: map.get(SETTING_KEYS.upcomingGamesStartsAt) ?? null,
			text
		}
	};
}

export function upsertContentSettings(
	settings: ContentSettings,
	updatedBy: string
): { success: true } | { success: false; error: 'database_error' } {
	const db = getDb();
	const upsert = db.prepare(`
		INSERT INTO content_settings (key, value, updated_by, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_by = excluded.updated_by,
			updated_at = CURRENT_TIMESTAMP
	`);

	try {
		const run = db.transaction(() => {
			upsert.run(
				SETTING_KEYS.upcomingGamesEnabled,
				settings.upcomingGames.enabled ? 'true' : 'false',
				updatedBy
			);
			upsert.run(SETTING_KEYS.upcomingGamesStartsAt, settings.upcomingGames.startsAt ?? null, updatedBy);
			for (const locale of appLocales) {
				upsert.run(buildTextKey(locale), settings.upcomingGames.text[locale] ?? '', updatedBy);
			}
		});
		run();
		return { success: true };
	} catch {
		return { success: false, error: 'database_error' };
	}
}
