function parseBoolean(value: string | undefined, defaultValue = false): boolean {
	if (value == null) return defaultValue;
	return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
	if (value == null) return defaultValue;
	const n = Number(value);
	return Number.isFinite(n) ? n : defaultValue;
}

export const DISABLE_RATE_LIMITS = parseBoolean(process.env.DISABLE_RATE_LIMITS, false);

export const RATE_LIMIT_WINDOW_SECONDS = parseNumber(process.env.RATE_LIMIT_WINDOW_SECONDS, 120);

export const CALLSIGN_CHECK_RATE_LIMIT_WINDOW_SECONDS = parseNumber(
	process.env.CALLSIGN_CHECK_RATE_LIMIT_WINDOW_SECONDS,
	10
);
export const CALLSIGN_CHECK_RATE_LIMIT_MAX_REQUESTS = parseNumber(
	process.env.CALLSIGN_CHECK_RATE_LIMIT_MAX_REQUESTS,
	20
);

export const CALLSIGN_SEARCH_RATE_LIMIT_WINDOW_SECONDS = parseNumber(
	process.env.CALLSIGN_SEARCH_RATE_LIMIT_WINDOW_SECONDS,
	10
);
export const CALLSIGN_SEARCH_RATE_LIMIT_MAX_REQUESTS = parseNumber(
	process.env.CALLSIGN_SEARCH_RATE_LIMIT_MAX_REQUESTS,
	10
);
