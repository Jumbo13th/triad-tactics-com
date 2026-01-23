declare module '@getbrevo/brevo' {
	export class TransactionalEmailsApi {
		authentications: { apiKey: { apiKey: string } };
		sendTransacEmail(message: SendSmtpEmail): Promise<{ body?: unknown }>;
	}

	export class SendSmtpEmail {
		subject?: string;
		textContent?: string;
		sender?: { name?: string; email?: string };
		to?: Array<{ email: string; name?: string }>;
		replyTo?: { name?: string; email?: string };
		tags?: string[];
	}
}
