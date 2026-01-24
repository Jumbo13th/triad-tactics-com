export interface SteamSession {
	id: string;
	redirect_path: string;
	steamid64?: string | null;
	persona_name?: string | null;
	created_at?: string;
}
