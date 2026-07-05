import { NextRequest } from 'next/server';

/**
 * Resolve the client IP for rate-limiting / logging in a way that cannot be
 * spoofed by the client.
 *
 * The app runs behind nginx (see nginx/default.conf), which sets:
 *   - X-Real-IP: the real TCP peer ($remote_addr) — overwritten on every hop,
 *     so a client cannot forge it.
 *   - X-Forwarded-For: "$proxy_add_x_forwarded_for", which APPENDS the peer to
 *     any client-supplied value. The right-most entry is therefore the address
 *     nginx observed; the left-most is attacker-controlled.
 *
 * A previous implementation trusted the LEFT-most X-Forwarded-For entry, letting
 * a client rotate that header to mint unlimited rate-limit buckets. We prefer
 * X-Real-IP and fall back to the right-most X-Forwarded-For entry.
 */
export function getClientIp(request: NextRequest): string {
	const realIp = request.headers.get('x-real-ip')?.trim();
	if (realIp) return realIp;

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
