import type { SteamStatusResult } from './getSteamStatus';

/**
 * Returns a redirect path for users who must complete a required flow
 * (rename required, application required). Returns null when no redirect needed.
 */
export function getUserFlowRedirect(locale: string, status: SteamStatusResult): string | null {
	if (!status.connected) return null;

	if (status.renameRequired && !status.hasPendingRenameRequest) {
		return `/${locale}/rename`;
	}

	if (!status.hasExisting) {
		return `/${locale}/apply`;
	}

	return null;
}
