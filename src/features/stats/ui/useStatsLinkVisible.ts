'use client';

import { useEffect, useState } from 'react';

// False until the visibility endpoint confirms stats are shown — the navbar
// link pops in rather than flashing away when the admin has hidden the
// statistics section (same late-appear behavior as the games "Active" badge).
export function useStatsLinkVisible(): boolean {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch('/api/stats/visibility', {
					cache: 'no-store',
					headers: { Accept: 'application/json' }
				});
				if (!res.ok) return;

				const json = (await res.json()) as { success?: boolean; hidden?: boolean };
				if (!cancelled && json.success === true) setVisible(json.hidden !== true);
			} catch {
				// Leave the link hidden — navigation must not break on a failed probe.
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return visible;
}
