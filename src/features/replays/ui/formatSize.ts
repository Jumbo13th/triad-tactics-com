export function formatSize(bytes: number, locale: string): string {
	if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString(locale)} KB`;
	const value = (bytes / 1_000_000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	return `${value} MB`;
}
