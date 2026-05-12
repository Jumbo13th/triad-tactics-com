'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';

export function useSlottingSSE(shortCode: string, currentRevision: number) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const revisionRef = useRef(currentRevision);

	useEffect(() => {
		revisionRef.current = currentRevision;
	}, [currentRevision]);

	useEffect(() => {
		const source = new EventSource(`/api/games/${encodeURIComponent(shortCode)}/events`);

		source.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data as string) as { type: string; slottingRevision?: number };
				if (data.type === 'slotting_updated' && typeof data.slottingRevision === 'number' && data.slottingRevision > revisionRef.current) {
					revisionRef.current = data.slottingRevision;
					startTransition(() => router.refresh());
				}
			} catch {
				// Ignore parse errors
			}
		};

		source.onerror = () => {
			// EventSource auto-reconnects
		};

		return () => {
			source.close();
		};
	}, [shortCode, router, startTransition]);
}
