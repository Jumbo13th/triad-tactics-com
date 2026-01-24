export interface User {
	id: number;
	created_at?: string;
	player_confirmed_at?: string | null;
	confirmed_application_id?: number | null;
	current_callsign?: string | null;
	rename_required_at?: string | null;
	rename_required_reason?: string | null;
	rename_required_by_steamid64?: string | null;
}
