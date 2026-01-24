import 'dotenv/config';

import { buildApprovalContent, sendApplicationApprovedEmail } from '@/platform/email/brevo';

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

function parseBoolean(value: string | undefined): boolean {
	if (!value) return false;
	return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function assertIncludes(haystack: string, needle: string, label: string) {
	if (!haystack.includes(needle)) {
		throw new Error(`Canary preflight failed: missing ${label}.`);
	}
}

async function run() {
	if (process.env.NODE_ENV === 'test') {
		throw new Error('NODE_ENV=test disables email sending. Set NODE_ENV=production for canary runs.');
	}
	const toEmail = requireEnv('CANARY_EMAIL_TO');
	const toName = process.env.CANARY_EMAIL_NAME?.trim() || null;
	const callsign = process.env.CANARY_CALLSIGN?.trim() || null;
	const locale = process.env.CANARY_LOCALE?.trim() || null;
	const renameRequired = parseBoolean(process.env.CANARY_RENAME_REQUIRED);
	const websiteUrl = 'https://triad-tactics.com';

	const rendered = await buildApprovalContent({
		toEmail,
		toName,
		callsign,
		locale,
		renameRequired
	});

	assertIncludes(rendered.textContent, websiteUrl, 'website URL');

	const result = await sendApplicationApprovedEmail({
		toEmail,
		toName,
		callsign,
		locale,
		renameRequired
	});

	if (!result.ok) {
		throw new Error(`Canary email failed: ${result.error}${result.details ? ` (${result.details})` : ''}`);
	}

	const mode = renameRequired ? 'approval + rename required' : 'approval';
	console.log(`Canary email sent (${mode}) to ${toEmail}.`);
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
