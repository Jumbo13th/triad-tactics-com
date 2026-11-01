'use client';

import { useCallback, useSyncExternalStore } from 'react';

// How a viewer likes the replay laid out: kept in this browser only, read through an
// external store so the server render and hydration see the defaults first.

export type MapLayers = {
	/** Players' names on their soldiers and bodies. */
	nicknames: boolean;
	aiRoles: boolean;
	squads: boolean;
	vehicleNames: boolean;
	markers: boolean;
	markerText: boolean;
	areas: boolean;
	areaNames: boolean;
	fire: boolean;
	dead: boolean;
};

export type ViewerSettings = {
	unitsOpen: boolean;
	eventsOpen: boolean;
	unitsWidth: number;
	eventsWidth: number;
	speed: number;
	layers: MapLayers;
};

export const PANEL_MIN = 220;
export const PANEL_MAX = 520;
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 300;

// Only what is needed to follow a game is on by default; the rest is a toggle away.
export const DEFAULT_LAYERS: MapLayers = {
	nicknames: true,
	aiRoles: false,
	squads: false,
	vehicleNames: false,
	markers: true,
	markerText: false,
	areas: true,
	areaNames: false,
	fire: true,
	dead: true,
};

export const DEFAULT_SETTINGS: ViewerSettings = {
	unitsOpen: true,
	eventsOpen: true,
	unitsWidth: 288,
	eventsWidth: 320,
	speed: 16,
	layers: DEFAULT_LAYERS,
};

const KEY = 'replay-viewer:v1';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function parse(raw: string | null): ViewerSettings {
	if (!raw) return DEFAULT_SETTINGS;
	try {
		const stored = JSON.parse(raw) as Partial<Record<keyof ViewerSettings, unknown>>;
		const layers = { ...DEFAULT_LAYERS };
		if (stored.layers && typeof stored.layers === 'object') {
			for (const key of Object.keys(DEFAULT_LAYERS) as (keyof MapLayers)[]) {
				const value = (stored.layers as Record<string, unknown>)[key];
				if (typeof value === 'boolean') layers[key] = value;
			}
		}
		return {
			unitsOpen: typeof stored.unitsOpen === 'boolean' ? stored.unitsOpen : DEFAULT_SETTINGS.unitsOpen,
			eventsOpen: typeof stored.eventsOpen === 'boolean' ? stored.eventsOpen : DEFAULT_SETTINGS.eventsOpen,
			unitsWidth: clamp(stored.unitsWidth, PANEL_MIN, PANEL_MAX, DEFAULT_SETTINGS.unitsWidth),
			eventsWidth: clamp(stored.eventsWidth, PANEL_MIN, PANEL_MAX, DEFAULT_SETTINGS.eventsWidth),
			speed: clamp(stored.speed, SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS.speed),
			layers,
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

let cache: { raw: string | null; value: ViewerSettings } | null = null;
// Where settings live when the browser refuses storage (private windows, blocked site data).
let memory: ViewerSettings | null = null;
const listeners = new Set<() => void>();

function snapshot(): ViewerSettings {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(KEY);
	} catch {
		return memory ?? DEFAULT_SETTINGS;
	}
	if (cache && cache.raw === raw) return cache.value;
	cache = { raw, value: parse(raw) };
	return cache.value;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => {
		if (event.key === KEY) listener();
	};
	window.addEventListener('storage', onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener('storage', onStorage);
	};
}

export function useViewerSettings(): [ViewerSettings, (patch: Partial<ViewerSettings>) => void] {
	const settings = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SETTINGS);
	const update = useCallback((patch: Partial<ViewerSettings>) => {
		const next = { ...snapshot(), ...patch };
		const raw = JSON.stringify(next);
		try {
			window.localStorage.setItem(KEY, raw);
			cache = { raw, value: next };
		} catch {
			memory = next;
		}
		for (const listener of listeners) listener();
	}, []);
	return [settings, update];
}
