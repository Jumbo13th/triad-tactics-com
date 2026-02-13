'use client';

import { useEffect, useState } from 'react';
import { parseUserStatus, type UserStatus } from '@/features/users/domain/api';

export function useUserStatus() {
	const [status, setStatus] = useState<UserStatus | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/me', { cache: 'no-store' });
				const json: unknown = (await res.json()) as unknown;
				const parsed = parseUserStatus(json);
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
