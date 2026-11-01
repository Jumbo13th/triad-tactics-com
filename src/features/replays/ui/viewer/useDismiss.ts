'use client';

import { useEffect, type RefObject } from 'react';

/** Closes a popover on Escape or on a press outside `root`, the way menus behave. */
export function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: () => void) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				// Captured first, so the viewer's own Escape (clear the selection) waits its turn.
				event.stopPropagation();
				close();
			}
		};
		const onDown = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) close();
		};
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('pointerdown', onDown);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('pointerdown', onDown);
		};
	}, [open, root, close]);
}
