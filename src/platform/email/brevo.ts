import { createHash } from 'node:crypto';
import { errorToLogObject, logger } from '@/platform/logger';
import { defaultLocale, isAppLocale } from '@/i18n/locales';
import { getRequestContext } from '@/platform/requestContext';

type BrevoRecipient = { email: string; name?: string };

type BrevoEmailPayload = {
	sender: { name: string; email: string };
	to: BrevoRecipient[];
	subject: string;
	textContent: string;
	replyTo?: { email: string; name: string };
	tags?: string[];
};

export function buildRecipient(email: string, name?: string | null): BrevoRecipient {
	const trimmedName = name?.trim();
	if (trimmedName && trimmedName.length > 0) {
		return { email, name: trimmedName };
	}
	return { email };
}

async function sendBrevoEmail(
	apiKey: string,
	payload: BrevoEmailPayload
): Promise<{ ok: true; body?: unknown } | { ok: false; status: number; body?: unknown }> {
	const response = await fetch('https://api.brevo.com/v3/smtp/email', {
		method: 'POST',
		headers: {
			'api-key': apiKey,
			'Content-Type': 'application/json; charset=utf-8',
			Accept: 'application/json'
		},
		body: JSON.stringify(payload)
	});

	const body = await response.json().catch(() => undefined);
	if (response.ok) {
		return { ok: true, body };
	}
	return { ok: false, status: response.status, body };
}

type BrevoConfig = {
	apiKey: string;
	senderEmail: string;
	senderName: string;
	replyToEmail?: string;
};

export type ApprovalEmailInput = {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
	renameRequired?: boolean;
};

export type ApprovedBroadcastInput = {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
	subjectTemplate: string;
	bodyTemplate: string;
};

export type OutboxEmailInput = {
	toEmail: string;
	toName?: string | null;
	subject: string;
	textContent: string;
	tags?: string[];
};

type BrevoSendResult =
	| { ok: true; skipped?: boolean }
	| { ok: false; error: 'send_failed'; details?: string };

function getBrevoConfig(): BrevoConfig {
	const apiKey = process.env.BREVO_API_KEY?.trim();
	const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
	const senderName = process.env.BREVO_SENDER_NAME?.trim();
	const replyToEmail = process.env.BREVO_REPLY_TO_EMAIL?.trim();

	if (!apiKey || !senderEmail || !senderName) {
		throw new Error('BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_SENDER_NAME must be configured');
	}
	return { apiKey, senderEmail, senderName, replyToEmail };
}

function resolveLocale(locale: string | null | undefined) {
	if (typeof locale === 'string' && isAppLocale(locale)) return locale;
	return defaultLocale;
}

async function loadMessages(locale: string) {
	const resolved = resolveLocale(locale);
	const messagesModule = await import(`../../../messages/${resolved}.json`);
	return messagesModule.default as Record<string, unknown>;
}

function formatTemplate(template: string, params: Record<string, string>) {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '');
}

function hashEmail(email: string): string {
	return createHash('sha1').update(email.trim().toLowerCase()).digest('hex').slice(0, 12);
}

function getEmailDomain(email?: string | null): string | undefined {
	if (!email) return undefined;
	const at = email.lastIndexOf('@');
	if (at <= 0) return undefined;
	return email.slice(at + 1).toLowerCase();
}

function summarizeRecipient(email: string) {
	return {
		emailHash: hashEmail(email),
		emailDomain: getEmailDomain(email)
	};
}

export async function buildApprovalContent(input: ApprovalEmailInput) {
	const name = input.toName?.trim() || input.callsign?.trim() || 'there';
	const resolvedLocale = resolveLocale(input.locale ?? undefined);
	const messages = await loadMessages(resolvedLocale);
	const emailSection = (messages.email as Record<string, unknown> | undefined) ?? {};
	const approved = (emailSection.applicationApproved as Record<string, string> | undefined) ?? {};
	const approvedRename =
		(emailSection.applicationApprovedRenameRequired as Record<string, string> | undefined) ?? {};

	const siteUrl = 'https://triad-tactics.com';
	const params = {
		name,
		websiteUrl: siteUrl
	};

	const useRenameTemplate = input.renameRequired === true;
	const template = useRenameTemplate ? approvedRename : approved;

	const subject =
		template.subject ??
		(useRenameTemplate
			? 'Your Triad Tactics application is approved — callsign update needed'
			: 'Your Triad Tactics application is approved');
	const greeting = template.greeting ?? 'Hi {name},';
	const line1 =
		template.line1 ??
		(useRenameTemplate
			? 'Good news — your application has been approved.'
			: 'Good news — your Triad Tactics application has been approved.');
	const line2 =
		template.line2 ??
		(useRenameTemplate
			? 'Before you can join sessions, we need you to update your callsign.'
			: 'Please visit {websiteUrl} and sign in with Steam to check your access.');
	const line3 =
		template.line3 ??
		(useRenameTemplate
			? 'Please sign in at {websiteUrl} and change your callsign.'
			: 'On the main page you’ll find our Discord and Telegram — please join them to get announcements and schedules.');
	const line4 =
		template.line4 ??
		(useRenameTemplate
			? 'On the main page you’ll find our Discord and Telegram — please join them to get announcements and schedules.'
			: 'If you have any questions, reply to this email and we’ll help.');
	const line5 = template.line5 ?? (useRenameTemplate ? 'If anything is unclear, just reply to this email.' : undefined);
	const line6 = template.line6 ?? undefined;
	const line7 = template.line7 ?? undefined;
	const signature = template.signature ?? '— Triad Tactics';

	const lines = [line1, line2, line3, line4, line5, line6, line7]
		.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
		.map((line) => formatTemplate(line, params));

	const textContent = [formatTemplate(greeting, params), '', ...lines, '', signature].join('\n');

	return { subject: formatTemplate(subject, params), textContent };
}

export function buildApprovedBroadcastContent(input: ApprovedBroadcastInput) {
	const name = input.toName?.trim() || input.callsign?.trim() || 'there';
	const callsign = input.callsign?.trim() || input.toName?.trim() || 'there';
	const siteUrl = 'https://triad-tactics.com';
	const params = {
		name,
		callsign,
		websiteUrl: siteUrl
	};

	const subject = formatTemplate(input.subjectTemplate, params).trim();
	const textContent = formatTemplate(input.bodyTemplate, params).trim();

	return { subject, textContent };
}

export async function sendApplicationApprovedEmail(input: ApprovalEmailInput): Promise<BrevoSendResult> {
	if (process.env.NODE_ENV === 'test') return { ok: true, skipped: true };

	const startedAt = Date.now();
	const config = getBrevoConfig();
	const ctx = getRequestContext();
	const log = logger.child({
		requestId: ctx?.requestId,
		route: ctx?.route,
		provider: 'brevo',
		template: 'application_approved',
		recipient: summarizeRecipient(input.toEmail),
		senderDomain: getEmailDomain(config.senderEmail),
		locale: resolveLocale(input.locale ?? undefined),
		renameRequired: input.renameRequired ?? false
	});

	const { subject, textContent } = await buildApprovalContent(input);
	log.info({ subjectLength: subject.length, bodyLength: textContent.length }, 'brevo_send_start');

	const recipientName = input.toName?.trim() || input.callsign?.trim() || null;
	const payload: BrevoEmailPayload = {
		sender: { name: config.senderName, email: config.senderEmail },
		to: [buildRecipient(input.toEmail, recipientName)],
		subject,
		textContent,
		tags: ['application-approved']
	};
	if (config.replyToEmail) {
		payload.replyTo = { email: config.replyToEmail, name: config.senderName };
	}

	try {
		const response = await sendBrevoEmail(config.apiKey, payload);
		const durationMs = Date.now() - startedAt;
		if (response.ok) {
			log.info({ durationMs, brevoResponse: response.body }, 'brevo_send_success');
			return { ok: true };
		}
		const details = JSON.stringify({ status: response.status, body: response.body });
		log.error({ durationMs, status: response.status, body: response.body }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	} catch (error: unknown) {
		const durationMs = Date.now() - startedAt;
		const details = JSON.stringify(errorToLogObject(error));
		log.error({ ...errorToLogObject(error), durationMs }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	}
}

export async function sendOutboxEmail(input: OutboxEmailInput): Promise<BrevoSendResult> {
	if (process.env.NODE_ENV === 'test') return { ok: true, skipped: true };

	const startedAt = Date.now();
	const config = getBrevoConfig();
	const ctx = getRequestContext();
	const log = logger.child({
		requestId: ctx?.requestId,
		route: ctx?.route,
		provider: 'brevo',
		template: 'outbox',
		recipient: summarizeRecipient(input.toEmail),
		senderDomain: getEmailDomain(config.senderEmail)
	});

	const subject = input.subject.trim();
	const textContent = input.textContent.trim();
	log.info({ subjectLength: subject.length, bodyLength: textContent.length }, 'brevo_send_start');

	const payload: BrevoEmailPayload = {
		sender: { name: config.senderName, email: config.senderEmail },
		to: [buildRecipient(input.toEmail, input.toName)],
		subject,
		textContent
	};
	if (input.tags?.length) payload.tags = input.tags;
	if (config.replyToEmail) {
		payload.replyTo = { email: config.replyToEmail, name: config.senderName };
	}

	try {
		const response = await sendBrevoEmail(config.apiKey, payload);
		const durationMs = Date.now() - startedAt;
		if (response.ok) {
			log.info({ durationMs, brevoResponse: response.body }, 'brevo_send_success');
			return { ok: true };
		}
		const details = JSON.stringify({ status: response.status, body: response.body });
		log.error({ durationMs, status: response.status, body: response.body }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	} catch (error: unknown) {
		const durationMs = Date.now() - startedAt;
		const details = JSON.stringify(errorToLogObject(error));
		log.error({ ...errorToLogObject(error), durationMs }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	}
}
