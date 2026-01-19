export type AdminStatus =
	| { connected: false; isAdmin: false }
	| {
			connected: true;
			isAdmin: boolean;
			steamid64: string;
			personaName: string | null;
			callsign: string | null;
	  };
