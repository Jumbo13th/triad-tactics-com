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

function assertNoCyrillicCorruption(text: string) {
	// Detect common UTF-8 mojibake patterns (Cyrillic interpreted as Latin-1/CP1252)
	// When UTF-8 Cyrillic (2 bytes per char) is decoded as Latin-1, you get sequences like:
	// - "╨" (U+2550) followed by various box-drawing or extended Latin chars
	// - "Ð" (U+00D0) followed by extended Latin chars
	// These patterns should never appear in properly encoded Russian text
	const corruptionIndicators = [
		'╨', // Box drawing character that appears in corrupted UTF-8
		'╤', // Another box drawing character from corruption
		'Ã', // Common Latin-1 misinterpretation prefix
	];
	for (const indicator of corruptionIndicators) {
		if (text.includes(indicator)) {
			throw new Error(`Canary preflight failed: detected Cyrillic encoding corruption (mojibake) in text - found "${indicator}"`);
		}
	}
}

async function runSingleLocale(options: {
	toEmail: string;
	toName: string | null;
	callsign: string | null;
	locale: string | null;
	renameRequired: boolean;
}) {
	const websiteUrl = 'https://triad-tactics.com';
	const localeLabel = options.locale ?? 'en';

	const rendered = await buildApprovalContent({
		toEmail: options.toEmail,
		toName: options.toName,
		callsign: options.callsign,
		locale: options.locale,
		renameRequired: options.renameRequired
	});

	assertIncludes(rendered.textContent, websiteUrl, `website URL (${localeLabel})`);
	assertNoCyrillicCorruption(rendered.subject);
	assertNoCyrillicCorruption(rendered.textContent);

	// For Russian locale, verify actual Cyrillic characters are present
	if (options.locale === 'ru') {
		assertIncludes(rendered.subject, 'Ваша заявка', 'Russian subject text');
		assertIncludes(rendered.textContent, 'Здравствуйте', 'Russian greeting');
	}

	const result = await sendApplicationApprovedEmail({
		toEmail: options.toEmail,
		toName: options.toName,
		callsign: options.callsign,
		locale: options.locale,
		renameRequired: options.renameRequired
	});

	if (!result.ok) {
		throw new Error(`Canary email failed (${localeLabel}): ${result.error}${result.details ? ` (${result.details})` : ''}`);
	}

	const mode = options.renameRequired ? 'approval + rename required' : 'approval';
	console.log(`Canary email sent (${mode}, locale=${localeLabel}) to ${options.toEmail}.`);
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
	const testAllLocales = parseBoolean(process.env.CANARY_TEST_ALL_LOCALES);

	if (testAllLocales) {
		// Test both English and Russian to ensure UTF-8 encoding works
		console.log('Testing all locales (en, ru)...\n');
		
		await runSingleLocale({ toEmail, toName, callsign, locale: 'en', renameRequired });
		await runSingleLocale({ toEmail, toName, callsign, locale: 'ru', renameRequired });
		
		console.log('\nAll locale tests passed.');
	} else {
		await runSingleLocale({ toEmail, toName, callsign, locale, renameRequired });
	}
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
