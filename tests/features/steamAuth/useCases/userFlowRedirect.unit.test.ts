import { describe, expect, it } from 'vitest';
import { getUserFlowRedirect } from '@/features/steamAuth/useCases/userFlowRedirect';
import type { UserStatus } from '@/features/users/domain/api';

function makeConnectedStatus(overrides: Partial<Extract<UserStatus, { connected: true }>> = {}): UserStatus {
	return {
		connected: true,
		steamid64: '76561198000000001',
		personaName: 'Persona',
		currentCallsign: 'TestUser',
		discordId: null,
		armaGuid: 'a1b2c3d4-5678-9abc-def0-1234567890ab',
		hasExisting: true,
		submittedAt: '2024-01-01T00:00:00Z',
		renameRequired: false,
		hasPendingRenameRequest: false,
		renameRequiredReason: null,
		renameRequiredBySteamId64: null,
		renameRequiredByCallsign: null,
		armaGuidRequired: false,
		accessLevel: 'player',
		badges: [],
		...overrides
	};
}

describe('getUserFlowRedirect', () => {
	it('returns null when no redirect is needed', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus());
		expect(result).toBeNull();
	});

	it('returns null for disconnected users', () => {
		const result = getUserFlowRedirect('en', { connected: false });
		expect(result).toBeNull();
	});

	it('redirects to rename when rename is required and no pending request', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			renameRequired: true,
			hasPendingRenameRequest: false
		}));
		expect(result).toBe('/en/rename');
	});

	it('does not redirect to rename when pending rename request exists', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			renameRequired: true,
			hasPendingRenameRequest: true
		}));
		expect(result).toBeNull();
	});

	it('redirects to apply when user has no existing application', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			hasExisting: false
		}));
		expect(result).toBe('/en/apply');
	});

	it('redirects to arma-id when armaGuidRequired is true', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			armaGuidRequired: true
		}));
		expect(result).toBe('/en/arma-id');
	});

	it('does not redirect to arma-id when armaGuidRequired is false', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			armaGuidRequired: false
		}));
		expect(result).toBeNull();
	});

	it('prioritizes rename redirect over arma-id redirect', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			renameRequired: true,
			hasPendingRenameRequest: false,
			armaGuidRequired: true
		}));
		expect(result).toBe('/en/rename');
	});

	it('prioritizes apply redirect over arma-id redirect', () => {
		const result = getUserFlowRedirect('en', makeConnectedStatus({
			hasExisting: false,
			armaGuidRequired: true
		}));
		expect(result).toBe('/en/apply');
	});

	it('uses the provided locale in the redirect path', () => {
		const result = getUserFlowRedirect('ru', makeConnectedStatus({
			armaGuidRequired: true
		}));
		expect(result).toBe('/ru/arma-id');
	});
});
