import { NextRequest } from 'next/server';

/**
 * Resolve the client IP for rate-limiting / logging in a way that cannot be
 * spoofed by the client.
 *
 * kamal-proxy drops client-supplied X-Forwarded-* headers and sets
 * X-Forwarded-For to the TCP peer it observed; if forwarding is ever enabled it
 * appends that peer instead, so the right-most entry is always the real client.
 *
 * X-Real-IP is deliberately ignored: the proxy passes it through untouched, so
 * trusting it would let a client rotate it to mint unlimited rate-limit buckets.
 * The left-most X-Forwarded-For entry is attacker-controlled for the same reason.
 */
export function getClientIp(request: NextRequest): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		const parts = forwardedFor
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		const rightmost = parts[parts.length - 1];
		if (rightmost) return rightmost;
	}

	return 'unknown';
}
