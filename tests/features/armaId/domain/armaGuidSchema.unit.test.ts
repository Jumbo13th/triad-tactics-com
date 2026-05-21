import { describe, expect, it } from 'vitest';
import { armaGuidSchema } from '@/features/armaId/domain/armaGuidSchema';

describe('armaGuidSchema', () => {
	it('accepts a valid lowercase UUID', () => {
		const result = armaGuidSchema.safeParse('a1b2c3d4-5678-9abc-def0-1234567890ab');
		expect(result.success).toBe(true);
	});

	it('accepts a valid uppercase UUID', () => {
		const result = armaGuidSchema.safeParse('A1B2C3D4-5678-9ABC-DEF0-1234567890AB');
		expect(result.success).toBe(true);
	});

	it('accepts a valid mixed-case UUID', () => {
		const result = armaGuidSchema.safeParse('a1B2c3D4-5678-9aBc-DeF0-1234567890Ab');
		expect(result.success).toBe(true);
	});

	it('trims whitespace before validating', () => {
		const result = armaGuidSchema.safeParse('  a1b2c3d4-5678-9abc-def0-1234567890ab  ');
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe('a1b2c3d4-5678-9abc-def0-1234567890ab');
		}
	});

	it('rejects empty string', () => {
		const result = armaGuidSchema.safeParse('');
		expect(result.success).toBe(false);
	});

	it('rejects whitespace-only string', () => {
		const result = armaGuidSchema.safeParse('   ');
		expect(result.success).toBe(false);
	});

	it('rejects a UUID without dashes', () => {
		const result = armaGuidSchema.safeParse('a1b2c3d456789abcdef01234567890ab');
		expect(result.success).toBe(false);
	});

	it('rejects a UUID with wrong segment lengths', () => {
		const result = armaGuidSchema.safeParse('a1b2c3d4-56789-abc-def0-1234567890ab');
		expect(result.success).toBe(false);
	});

	it('rejects non-hex characters', () => {
		const result = armaGuidSchema.safeParse('g1b2c3d4-5678-9abc-def0-1234567890ab');
		expect(result.success).toBe(false);
	});

	it('rejects a too-short string', () => {
		const result = armaGuidSchema.safeParse('a1b2c3d4-5678');
		expect(result.success).toBe(false);
	});

	it('rejects arbitrary text', () => {
		const result = armaGuidSchema.safeParse('not-a-guid-at-all');
		expect(result.success).toBe(false);
	});

	it('uses armaGuidInvalidFormat as the issue message for bad format', () => {
		const result = armaGuidSchema.safeParse('invalid');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe('armaGuidInvalidFormat');
		}
	});

	it('uses required as the issue message for empty input', () => {
		const result = armaGuidSchema.safeParse('');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe('required');
		}
	});
});
