'use client';

import { useEffect, useState } from 'react';

export type AdminStatus =
	| { connected: false; isAdmin: false }
	| {
			connected: true;
			isAdmin: boolean;
			steamid64: string;
			personaName: string | null;
			callsign: string | null;
	  };

export function useAdminStatus() {
	const [status, setStatus] = useState<AdminStatus | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json = (await res.json()) as AdminStatus;
				if (!cancelled) setStatus(json);
			} catch {
				if (!cancelled) setStatus({ connected: false, isAdmin: false });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return status;
}
