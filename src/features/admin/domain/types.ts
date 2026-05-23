export type AdminUserBadge = {
	id: number;
	label: string;
	status: 'active' | 'retired';
	assigned_at?: string;
	assigned_by_steamid64?: string | null;
};

export type AdminBadgeType = {
	id: number;
	label: string;
	status: 'active' | 'retired';
	discord_role_id: string | null;
	created_at?: string;
	updated_at?: string;
	created_by_steamid64?: string | null;
	updated_by_steamid64?: string | null;
	user_count: number;
	mission_count: number;
};

export type AdminUserRow = {
	id: number;
	created_at?: string;
	player_confirmed_at?: string | null;
	confirmed_application_id?: number | null;
	current_callsign?: string | null;
	discord_id?: string | null;
	rename_required_at?: string | null;
	rename_required_reason?: string | null;
	rename_required_by_steamid64?: string | null;
	has_pending_rename_request: boolean;
	steamid64?: string | null;
	arma_guid?: string | null;
	badges: AdminUserBadge[];
	unit_id?: number | null;
	unit_name?: string | null;
	unit_tag?: string | null;
};

export type AdminRenameRequestRow = {
	id: number;
	user_id: number;
	old_callsign?: string | null;
	new_callsign: string;
	status: 'pending' | 'approved' | 'declined';
	created_at?: string;
	decided_at?: string | null;
	decided_by_steamid64?: string | null;
	decline_reason?: string | null;
	current_callsign?: string | null;
	rename_required_at?: string | null;
	steamid64?: string | null;
};
