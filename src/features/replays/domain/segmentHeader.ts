// The header every ll-replay/1 segment opens with: "LLR <version>", then "H <name> <fields>"
// lines up to "H end". Strings are JSON string literals.

export type SegmentHeader = {
	mission?: string;
	author?: string;
	world?: string;
	/** UTC Unix seconds at the start of the segment. */
	started?: number;
	segment?: number;
	/** Mission time in tenths of a second the segment resumed from. */
	resumed?: number;
};

const STRING_FIELDS = ['mission', 'author', 'world'] as const;
const NUMBER_FIELDS = ['started', 'segment', 'resumed'] as const;

function parseString(field: string): string | undefined {
	try {
		const value: unknown = JSON.parse(field);
		return typeof value === 'string' ? value : undefined;
	} catch {
		return undefined;
	}
}

function parseInteger(field: string): number | undefined {
	return /^-?\d{1,15}$/.test(field) ? Number(field) : undefined;
}

export function parseSegmentHeader(head: string): SegmentHeader | null {
	const lines = head.split('\n').map((line) => line.replace(/\r$/, ''));
	if (!/^LLR \d+$/.test(lines[0] ?? '')) return null;

	const header: SegmentHeader = {};
	for (const line of lines.slice(1)) {
		if (line === 'H end') break;
		const match = /^H ([a-z]+) (.+)$/.exec(line);
		if (!match) continue;
		const [, name, field] = match;
		if ((STRING_FIELDS as readonly string[]).includes(name)) {
			const value = parseString(field);
			if (value !== undefined) header[name as (typeof STRING_FIELDS)[number]] = value;
		} else if ((NUMBER_FIELDS as readonly string[]).includes(name)) {
			const value = parseInteger(field);
			if (value !== undefined) header[name as (typeof NUMBER_FIELDS)[number]] = value;
		}
	}
	return header;
}
