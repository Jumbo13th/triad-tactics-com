import { describe, expect, it } from 'vitest';
import { buildRecipient, buildApprovalContent } from '@/platform/email/brevo';

describe('buildRecipient', () => {
	it('includes name when provided', () => {
		const result = buildRecipient('user@example.com', 'John Smith');
		expect(result).toEqual({ email: 'user@example.com', name: 'John Smith' });
	});

	it('trims whitespace from name', () => {
		const result = buildRecipient('user@example.com', '  John Smith  ');
		expect(result).toEqual({ email: 'user@example.com', name: 'John Smith' });
	});

	it('omits name when null', () => {
		const result = buildRecipient('user@example.com', null);
		expect(result).toEqual({ email: 'user@example.com' });
		expect('name' in result).toBe(false);
	});

	it('omits name when undefined', () => {
		const result = buildRecipient('user@example.com', undefined);
		expect(result).toEqual({ email: 'user@example.com' });
		expect('name' in result).toBe(false);
	});

	it('omits name when empty string', () => {
		const result = buildRecipient('user@example.com', '');
		expect(result).toEqual({ email: 'user@example.com' });
		expect('name' in result).toBe(false);
	});

	it('omits name when only whitespace', () => {
		const result = buildRecipient('user@example.com', '   ');
		expect(result).toEqual({ email: 'user@example.com' });
		expect('name' in result).toBe(false);
	});
});

describe('buildApprovalContent', () => {
	it('uses toName for greeting when provided', async () => {
		const result = await buildApprovalContent({
			toEmail: 'user@example.com',
			toName: 'John',
			callsign: 'Bravo',
			locale: 'en'
		});
		expect(result.textContent).toContain('Hi John,');
	});

	it('falls back to callsign when toName is null', async () => {
		const result = await buildApprovalContent({
			toEmail: 'user@example.com',
			toName: null,
			callsign: 'Bravo',
			locale: 'en'
		});
		expect(result.textContent).toContain('Hi Bravo,');
	});

	it('falls back to callsign when toName is empty', async () => {
		const result = await buildApprovalContent({
			toEmail: 'user@example.com',
			toName: '   ',
			callsign: 'Alpha',
			locale: 'en'
		});
		expect(result.textContent).toContain('Hi Alpha,');
	});

	it('uses "there" when both toName and callsign are empty', async () => {
		const result = await buildApprovalContent({
			toEmail: 'user@example.com',
			toName: null,
			callsign: null,
			locale: 'en'
		});
		expect(result.textContent).toContain('Hi there,');
	});

	it('renders Russian content correctly without mojibake', async () => {
		const result = await buildApprovalContent({
			toEmail: 'user@example.com',
			toName: 'Иван',
			locale: 'ru'
		});
		expect(result.subject).toContain('Ваша заявка');
		expect(result.textContent).toContain('Здравствуйте');
		expect(result.subject).not.toContain('╨');
		expect(result.subject).not.toContain('╤');
		expect(result.textContent).not.toContain('╨');
		expect(result.textContent).not.toContain('╤');
	});
});
