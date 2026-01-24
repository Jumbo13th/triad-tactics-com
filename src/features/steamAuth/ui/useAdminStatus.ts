'use client';

import { useEffect, useState } from 'react';
import { parseAdminStatusResponse, type AdminStatus } from '@/features/admin/domain/api';

export function useAdminStatus() {
	const [status, setStatus] = useState<AdminStatus | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/admin/status', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseAdminStatusResponse(json);
				if (!cancelled) setStatus(parsed ?? { connected: false, isAdmin: false });
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
