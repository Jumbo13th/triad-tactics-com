import { TransactionalEmailsApi, SendSmtpEmail } from '@getbrevo/brevo';
import { errorToLogObject, logger } from '@/platform/logger';
import { defaultLocale, isAppLocale } from '@/i18n/locales';

type BrevoConfig = {
	apiKey: string;
	senderEmail: string;
	senderName: string;
	replyToEmail?: string;
};

type ApprovalEmailInput = {
	toEmail: string;
	toName?: string | null;
	callsign?: string | null;
	locale?: string | null;
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

async function buildApprovalContent(input: ApprovalEmailInput) {
	const name = input.toName?.trim() || input.callsign?.trim() || 'there';
	const resolvedLocale = resolveLocale(input.locale ?? undefined);
	const messages = await loadMessages(resolvedLocale);
	const emailSection = (messages.email as Record<string, unknown> | undefined) ?? {};
	const approved = (emailSection.applicationApproved as Record<string, string> | undefined) ?? {};

	const subject = approved.subject ?? 'Your Triad Tactics application is approved';
	const greeting = approved.greeting ?? 'Hi {name},';
	const line1 = approved.line1 ?? "Good news — your application has been approved.";
	const line2 = approved.line2 ?? "We'll be in touch with next steps soon.";
	const line3 = approved.line3 ?? 'If you have any questions, just reply to this email.';
	const signature = approved.signature ?? '— Triad Tactics';

	const textContent = [
		formatTemplate(greeting, { name }),
		'',
		line1,
		line2,
		'',
		line3,
		'',
		signature
	].join('\n');

	return { subject: formatTemplate(subject, { name }), textContent };
}

export async function sendApplicationApprovedEmail(input: ApprovalEmailInput): Promise<BrevoSendResult> {
	if (process.env.NODE_ENV === 'test') return { ok: true, skipped: true };

	const config = getBrevoConfig();

	const emailApi = new TransactionalEmailsApi();
	emailApi.authentications.apiKey.apiKey = config.apiKey;

	const { subject, textContent } = await buildApprovalContent(input);
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
		await emailApi.sendTransacEmail(message);
		return { ok: true };
	} catch (error: unknown) {
		const details = JSON.stringify(errorToLogObject(error));
		logger.error({ ...errorToLogObject(error) }, 'brevo_send_failed');
		return { ok: false, error: 'send_failed', details };
	}
}
