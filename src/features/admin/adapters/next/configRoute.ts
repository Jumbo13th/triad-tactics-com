import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './adminAuth';
import {
	BREVO_REPLY_TO_EMAIL,
	BREVO_SENDER_EMAIL,
	BREVO_SENDER_NAME
} from '@/platform/env';

const CONFIG_VALUES: Array<{ key: string; value: string | number | boolean | null | undefined }> = [
	{ key: 'BREVO_SENDER_EMAIL', value: BREVO_SENDER_EMAIL },
	{ key: 'BREVO_SENDER_NAME', value: BREVO_SENDER_NAME },
	{ key: 'BREVO_REPLY_TO_EMAIL', value: BREVO_REPLY_TO_EMAIL }
];

function toDisplayValue(value: string | number | boolean | null | undefined): string {
	if (value == null || value === '') return '—';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	return String(value);
}

export async function getAdminConfigRoute(request: NextRequest): Promise<NextResponse> {
	const admin = requireAdmin(request);
	if (!admin.ok) return admin.response;

	const config = CONFIG_VALUES.map((item) => ({
		key: item.key,
		value: toDisplayValue(item.value)
	}));

	return NextResponse.json({ success: true, config });
}
