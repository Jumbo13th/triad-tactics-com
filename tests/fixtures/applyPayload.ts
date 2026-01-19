export function buildApplySubmitPayload(opts?: {
	locale?: string;
	overrides?: Partial<Record<string, unknown>>;
}): Record<string, unknown> {
	return {
		callsign: 'Test_User',
		name: 'Test Name',
		age: '25',
		email: 'test@example.com',
		city: 'Test City',
		country: 'Test Country',
		availability: 'Weekends and evenings',
		timezone: 'UTC+02:00',
		experience: 'I have experience with milsim communities and moderation.',
		motivation: 'I want to help the community and contribute in a positive way.',
		...(typeof opts?.locale === 'string' ? { locale: opts.locale } : {}),
		...(opts?.overrides ?? {})
	};
}
