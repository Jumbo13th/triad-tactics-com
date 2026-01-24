function unique(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const v of values) {
		if (seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
}

export function normalizeCallsignForExactMatch(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[’'`]/g, '')
		.replace(/[_\-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/[^\p{L}\p{N} ]/gu, '')
		.replace(/\s+/g, '');
}

const CYR_MAP: Record<string, string> = {
	а: 'a',
	б: 'b',
	в: 'v',
	г: 'g',
	ґ: 'g',
	д: 'd',
	е: 'e',
	ё: 'yo',
	є: 'ye',
	ж: 'zh',
	з: 'z',
	и: 'i',
	і: 'i',
	ї: 'yi',
	й: 'y',
	к: 'k',
	л: 'l',
	м: 'm',
	н: 'n',
	о: 'o',
	п: 'p',
	р: 'r',
	с: 's',
	т: 't',
	у: 'u',
	ф: 'f',
	х: 'h',
	ц: 'ts',
	ч: 'ch',
	ш: 'sh',
	щ: 'shch',
	ъ: '',
	ы: 'y',
	ь: '',
	э: 'e',
	ю: 'yu',
	я: 'ya'
};

export function transliterateToLatin(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.split('')
		.map((ch) => (CYR_MAP[ch] !== undefined ? CYR_MAP[ch] : ch))
		.join('');
}

export function soundKey(value: string): string {
	// A small Soundex-like key, after transliteration.
	const s = transliterateToLatin(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '');
	if (!s) return '';

	const first = s[0];
	const map = (c: string): string => {
		if ('bfpv'.includes(c)) return '1';
		if ('cgjkqsxz'.includes(c)) return '2';
		if ('dt'.includes(c)) return '3';
		if (c === 'l') return '4';
		if ('mn'.includes(c)) return '5';
		if (c === 'r') return '6';
		return '0';
	};

	let out = first.toUpperCase();
	let prev = map(first);
	for (let i = 1; i < s.length; i++) {
		const code = map(s[i]!);
		if (code === '0') continue;
		if (code === prev) continue;
		out += code;
		prev = code;
		if (out.length >= 5) break;
	}
	return (out + '0000').slice(0, 5);
}

export function findCallsignConflicts(inputCallsign: string, existingCallsigns: string[]) {
	const inputExact = normalizeCallsignForExactMatch(inputCallsign);
	const inputSound = soundKey(inputCallsign);

	const exactMatches: string[] = [];
	const soundMatches: string[] = [];

	for (const c of existingCallsigns) {
		const exact = normalizeCallsignForExactMatch(c);
		if (exact && inputExact && exact === inputExact) {
			exactMatches.push(c);
			continue;
		}
		if (inputSound && soundKey(c) === inputSound) {
			soundMatches.push(c);
		}
	}

	return {
		normalized: inputExact,
		exactMatches: unique(exactMatches),
		soundMatches: unique(soundMatches).filter((c) => !exactMatches.includes(c))
	};
}
