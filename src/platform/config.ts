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

// Used both by API response (countdown) and limiter window.
export const RATE_LIMIT_WINDOW_SECONDS = parseNumber(process.env.RATE_LIMIT_WINDOW_SECONDS, 120);
