import { createHash } from 'node:crypto';
import { TransactionalEmailsApi, SendSmtpEmail } from '@getbrevo/brevo';
import { errorToLogObject, logger } from '@/platform/logger';
import { defaultLocale, isAppLocale } from '@/i18n/locales';
import { getRequestContext } from '@/platform/requestContext';

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

	const emailApi = new TransactionalEmailsApi();
	emailApi.authentications.apiKey.apiKey = config.apiKey;

	const { subject, textContent } = await buildApprovalContent(input);
	log.info({ subjectLength: subject.length, bodyLength: textContent.length }, 'brevo_send_start');

	const message = new SendSmtpEmail();
	message.subject = subject;
	message.textContent = textContent;
	message.sender = { name: config.senderName, email: config.senderEmail };
	message.to = [{ email: input.toEmail, name: input.toName ?? undefined }];
	message.tags = ['application-approved'];
	if (config.replyToEmail) {
		message.replyTo = { email: config.replyToEmail, name: config.senderName };
	}

	try {
		const response = await emailApi.sendTransacEmail(message);
		const durationMs = Date.now() - startedAt;
		log.info({ durationMs, brevoResponse: response?.body ?? undefined }, 'brevo_send_success');
		return { ok: true };
	} catch (error: unknown) {
		const durationMs = Date.now() - startedAt;
		const details = JSON.stringify(errorToLogObject(error));
		log.error({ ...errorToLogObject(error), durationMs }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	}
}
