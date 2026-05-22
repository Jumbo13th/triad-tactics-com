export type SanctionType = 'site_ban' | 'server_ban' | 'strike';

export type Sanction = {
	id: number;
	user_id: number;
	type: SanctionType;
	reason: string;
	expires_at: string | null;
	created_at: string;
	created_by_steamid64: string;
	cancelled_at: string | null;
	cancelled_by_steamid64: string | null;
	cancelled_reason: string | null;
	auto_generated: number;
	original_expires_at: string | null;
	expires_updated_by_steamid64: string | null;
};

export type SanctionWithCallsign = Sanction & {
	callsign: string | null;
	created_by_callsign: string | null;
	cancelled_by_callsign: string | null;
	expires_updated_by_callsign: string | null;
};

export type PublicSanctionEntry = {
	id: number;
	callsign: string | null;
	type: SanctionType;
	reason: string;
	expires_at: string | null;
	created_at: string;
	cancelled_at: string | null;
	cancelled_reason: string | null;
	auto_generated: number;
	issued_by: string | null;
	cancelled_by: string | null;
	original_expires_at: string | null;
	expires_updated_by: string | null;
};
