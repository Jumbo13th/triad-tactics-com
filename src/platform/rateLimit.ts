type RateLimitDecision =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

// Simple in-memory per-key sliding window limiter.
// NOTE: This resets on server restart and does not work across multiple instances.
const lastSeen = new Map<string, number>();

function prune(now: number, windowMs: number) {
	// Best-effort pruning to avoid unbounded growth.
	// Prune at most a small chunk per call.
	let pruned = 0;
	for (const [key, ts] of lastSeen) {
		if (now - ts > windowMs) {
			lastSeen.delete(key);
			pruned++;
			if (pruned >= 50) break;
		}
	}
}

export function checkRateLimit(key: string, windowSeconds: number): RateLimitDecision {
	const safeWindowSeconds = Number.isFinite(windowSeconds) && windowSeconds > 0
		? Math.floor(windowSeconds)
		: 120;
	const windowMs = safeWindowSeconds * 1000;
	const now = Date.now();

	prune(now, windowMs);

	const prev = lastSeen.get(key);
	if (typeof prev === 'number') {
		const elapsed = now - prev;
		if (elapsed < windowMs) {
			const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
			return { allowed: false, retryAfterSeconds };
		}
	}

	return { allowed: true };
}

export function markRateLimit(key: string) {
	lastSeen.set(key, Date.now());
}
