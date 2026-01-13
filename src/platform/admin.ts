import { ADMIN_STEAM_IDS } from './env';

function parseSteamId64List(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(/[\s,]+/)
		.map((v) => v.trim())
		.filter(Boolean);
}

let cachedRaw: string | undefined;
let cachedAllowlist: Set<string> | null = null;

function getAdminSteamIdAllowlist(): Set<string> {
	const raw = ADMIN_STEAM_IDS;
	if (cachedAllowlist && raw === cachedRaw) return cachedAllowlist;
	cachedRaw = raw;
	cachedAllowlist = new Set<string>(parseSteamId64List(raw));
	return cachedAllowlist;
}

export function isAdminConfigured(): boolean {
	return getAdminSteamIdAllowlist().size > 0;
}

export function isAdminSteamId(steamid64: string): boolean {
	return getAdminSteamIdAllowlist().has(steamid64);
}
