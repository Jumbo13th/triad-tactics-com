export interface ApplicationAnswers {
	callsign: string;
	/** Optional real name (new). */
	name: string;
	age: string;
	city: string;
	country: string;
	availability: string;
	timezone: string;
	experience: string;
	motivation: string;
	verified_game_access?: boolean;
}

export interface Application {
	id?: number;
	user_id?: number | null;
	email: string;
	steamid64: string;
	persona_name?: string | null;
	answers: ApplicationAnswers;
	ip_address?: string;
	locale?: string;
	created_at?: string;
	confirmed_at?: string | null;
	confirmed_by_steamid64?: string | null;
	approval_email_sent_at?: string | null;
}
