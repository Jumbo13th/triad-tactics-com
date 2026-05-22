import { describe, expect, it } from 'vitest';
import { isActiveSanction, localizeReason } from '@/features/sanctions/domain/api';

describe('isActiveSanction', () => {
	it('returns false when cancelled', () => {
		expect(isActiveSanction({ cancelled_at: '2026-01-01 00:00:00', expires_at: null })).toBe(false);
	});

	it('returns true when permanent and not cancelled', () => {
		expect(isActiveSanction({ cancelled_at: null, expires_at: null })).toBe(true);
	});

	it('returns true when expiry is in the future (space-separated UTC)', () => {
		const future = new Date(Date.now() + 86_400_000);
		const exp = future.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
		expect(isActiveSanction({ cancelled_at: null, expires_at: exp })).toBe(true);
	});

	it('returns false when expiry is in the past (space-separated UTC)', () => {
		const past = new Date(Date.now() - 86_400_000);
		const exp = past.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
		expect(isActiveSanction({ cancelled_at: null, expires_at: exp })).toBe(false);
	});

	it('handles ISO format with T and Z', () => {
		const future = new Date(Date.now() + 86_400_000).toISOString();
		expect(isActiveSanction({ cancelled_at: null, expires_at: future })).toBe(true);
	});

	it('handles ISO format with T but no Z', () => {
		const past = new Date(Date.now() - 86_400_000);
		const exp = past.toISOString().replace('Z', '').slice(0, 19);
		expect(isActiveSanction({ cancelled_at: null, expires_at: exp })).toBe(false);
	});

	it('cancelled takes precedence over active expiry', () => {
		const future = new Date(Date.now() + 86_400_000).toISOString();
		expect(isActiveSanction({ cancelled_at: '2026-01-01 00:00:00', expires_at: future })).toBe(false);
	});
});

describe('localizeReason', () => {
	const mockT = (key: string) => `translated:${key}`;

	it('returns raw text for non-auto reasons', () => {
		expect(localizeReason('Bad behavior', mockT)).toBe('Bad behavior');
	});

	it('returns empty string as-is', () => {
		expect(localizeReason('', mockT)).toBe('');
	});

	it('translates known auto: prefixed reasons', () => {
		expect(localizeReason('auto:3_active_strikes', mockT)).toBe('translated:autoReason_3_active_strikes');
	});

	it('translates escalated auto reason', () => {
		expect(localizeReason('auto:escalated_to_server_ban', mockT)).toBe('translated:autoReason_escalated_to_server_ban');
	});

	it('returns raw text for unknown auto: suffix', () => {
		expect(localizeReason('auto:unknown_reason', mockT)).toBe('auto:unknown_reason');
	});
});
