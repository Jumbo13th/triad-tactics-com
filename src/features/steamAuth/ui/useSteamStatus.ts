'use client';

import { useEffect, useState } from 'react';

export type SteamStatus =
	| { connected: false }
	| {
			connected: true;
			steamid64: string;
			personaName: string | null;
			hasExisting: boolean;
			submittedAt: string | null;
			accessLevel: 'guest' | 'player' | 'admin';
	  };

export function useSteamStatus() {
	const [status, setStatus] = useState<SteamStatus | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/auth/steam/me', { cache: 'no-store' });
				const json = (await res.json()) as SteamStatus;
				if (!cancelled) setStatus(json);
			} catch {
				if (!cancelled) setStatus({ connected: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return status;
}
