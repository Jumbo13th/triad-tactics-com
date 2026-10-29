import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp } from '@/platform/net/clientIp';

function requestWith(headers: Record<string, string>): NextRequest {
	return new NextRequest('http://localhost/api/submit', { headers });
}

describe('getClientIp', () => {
	it('uses the right-most X-Forwarded-For entry set by the proxy', () => {
		expect(getClientIp(requestWith({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7' }))).toBe('203.0.113.7');
	});

	it('ignores a client-supplied X-Real-IP', () => {
		const request = requestWith({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.7' });
		expect(getClientIp(request)).toBe('203.0.113.7');
	});

	it('reports unknown without a proxy header', () => {
		expect(getClientIp(requestWith({ 'x-real-ip': '198.51.100.1' }))).toBe('unknown');
	});
});
