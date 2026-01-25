'use client';

import { useEffect, useState } from 'react';
import { parseSteamMeStatus, type SteamMeStatus } from '@/features/steamAuth/domain/api';

export function useSteamStatus() {
	const [status, setStatus] = useState<SteamMeStatus | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/auth/steam/me', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseSteamMeStatus(json);
				if (!cancelled) setStatus(parsed ?? { connected: false });
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
