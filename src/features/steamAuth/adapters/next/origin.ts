import type { NextRequest } from 'next/server';

export function getRequestOrigin(request: NextRequest): string {
	const url = new URL(request.url);

	// Prefer forwarded headers when behind a proxy.
	const forwardedProto = request.headers.get('x-forwarded-proto');
	const forwardedHost = request.headers.get('x-forwarded-host');

	if (forwardedProto && forwardedHost) {
		return `${forwardedProto}://${forwardedHost}`;
	}

	return url.origin;
}
