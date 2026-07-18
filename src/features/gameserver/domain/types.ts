export type GameserverActiveBan = {
	type: 'server_ban';
	reason: string;
	expires_at: string | null;
};

export type GameserverPlayerUnit = {
	name: string;
	tag: string;
	role: string;
};

export type GameserverPlayer = {
	callsign: string;
	steam_id: string;
	discord_id: string | null;
	arma_id: string;
	badges: string[];
	unit: GameserverPlayerUnit | null;
	active_bans: GameserverActiveBan[];
};

// Compact unit roster for the in-game GM statistics panel (commander pickers).
export type GameserverUnitListItem = {
	name: string;
	tag: string;
};
