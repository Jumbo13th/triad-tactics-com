/**
 * In-process memo for derived statistics. Entries are keyed by a DB
 * fingerprint the caller supplies (see StatsRepo.dataFingerprint): an
 * in-memory version counter would NOT survive Next.js compiling route
 * handlers and server components into separate module instances.
 */
const store = new Map<string, { fingerprint: string; value: unknown }>();

export function statsCached<T>(key: string, fingerprint: string, compute: () => T): T {
	// DB path in the fingerprint: tests swap databases within one process.
	const stamp = `${process.env.DB_PATH}|${fingerprint}`;
	const hit = store.get(key);
	if (hit && hit.fingerprint === stamp) return hit.value as T;
	const value = compute();
	store.set(key, { fingerprint: stamp, value });
	return value;
}
