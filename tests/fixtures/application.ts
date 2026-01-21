export type TestApplicationRecord = {
	email: string;
	steamid64: string;
	persona_name: string;
	answers: {
		callsign: string;
		name: string;
		age: string;
		city: string;
		country: string;
		availability: string;
		timezone: string;
		experience: string;
		motivation: string;
	};
	ip_address: string;
	locale: string;
};

export function buildTestApplicationRecord(opts: {
	email: string;
	steamid64: string;
	callsign: string;
	overrides?: Omit<Partial<TestApplicationRecord>, 'answers'> & {
		answers?: Partial<TestApplicationRecord['answers']>;
	};
}): TestApplicationRecord {
	const base: TestApplicationRecord = {
		email: opts.email,
		steamid64: opts.steamid64,
		persona_name: 'Applicant',
		answers: {
			callsign: opts.callsign,
			name: 'Test Name',
			age: '25',
			city: 'Test City',
			country: 'Test Country',
			availability: 'Weekends',
			timezone: 'UTC+00:00',
			experience: 'Test experience',
			motivation: 'Test motivation'
		},
		ip_address: '203.0.113.10',
		locale: 'en'
	};

	if (!opts.overrides) {
		return base;
	}

	return {
		...base,
		...opts.overrides,
		answers: {
			...base.answers,
			...(opts.overrides.answers ?? {})
		}
	};
}
