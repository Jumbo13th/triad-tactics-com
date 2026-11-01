'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False while the page renders on the server and hydrates, true after: for text that
 * depends on the viewer's own clock or time zone, which the server cannot know.
 */
export function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false
	);
}
