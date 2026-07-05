import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of two secret strings.
 *
 * Plain `a === b` short-circuits on the first differing byte, which leaks the
 * length of the matching prefix through response timing and can let an attacker
 * recover a shared secret byte-by-byte. This compares in time independent of
 * where (or whether) the strings differ.
 *
 * Returns false for empty/missing inputs so callers can pass request-derived
 * values directly.
 */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;

	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');

	// timingSafeEqual requires equal-length buffers and throws otherwise. A
	// length mismatch means the secret is wrong regardless, so return false —
	// but still run a self-comparison so the branch does roughly the same work
	// and doesn't short-circuit noticeably faster than the compare below.
	if (bufA.length !== bufB.length) {
		timingSafeEqual(bufA, bufA);
		return false;
	}

	return timingSafeEqual(bufA, bufB);
}
