type RateLimitDecision =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

// NOTE: In-memory limiter; resets on restart and is not multi-instance safe.
const lastSeen = new Map<string, number>();

type FixedWindowState = { windowStart: number; count: number };
const fixedWindowCounters = new Map<string, FixedWindowState>();

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

function pruneFixedWindowCounters(now: number, windowMs: number) {
	// Best-effort pruning to avoid unbounded growth.
	let pruned = 0;
	for (const [key, state] of fixedWindowCounters) {
		if (now - state.windowStart > windowMs * 2) {
			fixedWindowCounters.delete(key);
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

// NOTE: In-memory limiter; resets on restart and is not multi-instance safe.
export function consumeFixedWindowRateLimit(
	key: string,
	windowSeconds: number,
	maxRequests: number
): RateLimitDecision {
	const safeWindowSeconds = Number.isFinite(windowSeconds) && windowSeconds > 0
		? Math.floor(windowSeconds)
		: 10;
	const safeMaxRequests = Number.isFinite(maxRequests) && maxRequests > 0
		? Math.floor(maxRequests)
		: 10;

	const windowMs = safeWindowSeconds * 1000;
	const now = Date.now();
	const windowStart = Math.floor(now / windowMs) * windowMs;

	pruneFixedWindowCounters(now, windowMs);

	const state = fixedWindowCounters.get(key);
	if (!state || state.windowStart !== windowStart) {
		fixedWindowCounters.set(key, { windowStart, count: 1 });
		return { allowed: true };
	}

	if (state.count >= safeMaxRequests) {
		const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
		return { allowed: false, retryAfterSeconds };
	}

	state.count += 1;
	fixedWindowCounters.set(key, state);
	return { allowed: true };
}
