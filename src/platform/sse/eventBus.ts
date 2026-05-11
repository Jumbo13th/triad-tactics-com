export type SlottingUpdatedEvent = {
	type: 'slotting_updated';
	shortCode: string;
	slottingRevision: number;
	timestamp: string;
};

export type SlottingEvent = SlottingUpdatedEvent;

type Listener = (event: SlottingEvent) => void;

class SlottingEventBus {
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	emit(event: SlottingEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// Listener errors should not break the bus
			}
		}
	}

	get listenerCount(): number {
		return this.listeners.size;
	}
}

// Use globalThis to survive Next.js hot module reloading in dev.
// Without this, HMR creates separate module instances and the emitter
// and subscriber end up on different bus objects.
const globalKey = '__slottingEventBus__' as const;
const g = globalThis as unknown as Record<string, SlottingEventBus | undefined>;
export const slottingEventBus: SlottingEventBus = g[globalKey] ?? (g[globalKey] = new SlottingEventBus());
