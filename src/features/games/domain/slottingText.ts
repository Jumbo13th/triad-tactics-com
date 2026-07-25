// Slotting JSON reaches the admin panel by paste, and the clipboard is the
// lossy part of that trip. The Arma lobby mod hands the OS raw UTF-8 bytes as
// single-byte text, so unless the mod escapes them, Cyrillic role names arrive
// re-read as Windows-1252 ("Командир" -> "ÐšÐ¾Ð¼Ð°Ð½Ð´Ð¸Ñ€"). Both hazards are
// undone here, at the one place that text enters the app: mangled bytes are
// decoded back to their original characters, and \uXXXX escapes become literal
// text so the field stays reviewable.

// Windows-1252 maps bytes 0x80-0x9F to these characters; every other byte maps
// to the code point of the same value. Reversing that gives back the original
// byte stream. Bytes with no character (0x81, 0x8D, 0x8F, 0x90, 0x9D) fall
// through the <= 0xFF branch below, which is what Windows itself does.
const cp1252HighChars: Record<string, number> = {
	'€': 0x80,
	'‚': 0x82,
	'ƒ': 0x83,
	'„': 0x84,
	'…': 0x85,
	'†': 0x86,
	'‡': 0x87,
	'ˆ': 0x88,
	'‰': 0x89,
	'Š': 0x8a,
	'‹': 0x8b,
	'Œ': 0x8c,
	'Ž': 0x8e,
	'‘': 0x91,
	'’': 0x92,
	'“': 0x93,
	'”': 0x94,
	'•': 0x95,
	'–': 0x96,
	'—': 0x97,
	'˜': 0x98,
	'™': 0x99,
	'š': 0x9a,
	'›': 0x9b,
	'œ': 0x9c,
	'ž': 0x9e,
	'Ÿ': 0x9f
};

function toWindows1252Byte(char: string): number | null {
	const code = char.codePointAt(0);
	if (code === undefined) return null;
	if (code <= 0xff) return code;
	return cp1252HighChars[char] ?? null;
}

/**
 * Undo one round of "UTF-8 bytes read as Windows-1252".
 *
 * Returns null whenever the input is not unambiguously that damage, leaving the
 * text untouched — which is what keeps correctly encoded pastes safe. Three
 * things disqualify a repair: any character Windows-1252 cannot express (real
 * Cyrillic, CJK, emoji), a byte stream that is not valid UTF-8, and a decode
 * that stays inside Latin-1.
 *
 * That last rule is the ambiguous case: "Â©" is byte-identical to the mojibake
 * of "©", so a decode producing only Latin-1 characters cannot be told apart
 * from text that was already correct, and the paste is left alone. Real damage
 * here decodes to Cyrillic — or to any of the other scripts the site runs —
 * which nothing else can be mistaken for. The cost is that accent-only damage
 * ("cafÃ©") is not repaired either.
 */
export function repairWindows1252Mojibake(input: string): string | null {
	if (input === '') return null;

	const bytes = new Uint8Array(input.length);
	let length = 0;
	let hasHighByte = false;

	for (const char of input) {
		const byte = toWindows1252Byte(char);
		if (byte === null) return null;
		if (byte >= 0x80) hasHighByte = true;
		bytes[length] = byte;
		length += 1;
	}

	// Pure ASCII cannot be mojibake, and decoding it would be a no-op anyway.
	if (!hasHighByte) return null;

	let decoded: string;
	try {
		decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
	} catch {
		return null;
	}

	if (decoded === input) return null;

	// A decode that still leaves C1 controls means the input was not mojibake,
	// just something that happens to be valid UTF-8. A decode that reveals no
	// character beyond Latin-1 is the ambiguous case described above.
	let revealsNonLatin1 = false;
	for (const char of decoded) {
		const code = char.codePointAt(0) ?? 0;
		if (code >= 0x80 && code <= 0x9f) return null;
		if (code > 0xff) revealsNonLatin1 = true;
	}

	if (!revealsNonLatin1) return null;

	return decoded;
}

export type SlottingTextNormalization = {
	text: string;
	repairedEncoding: boolean;
	reformatted: boolean;
};

/**
 * Normalize slotting JSON on its way into the admin textarea: repair mojibake,
 * then re-serialize valid JSON so \uXXXX escapes (what the lobby mod copies, to
 * survive the clipboard) render as the characters they stand for.
 */
export function normalizeSlottingJsonText(input: string): SlottingTextNormalization {
	const repaired = repairWindows1252Mojibake(input);
	const text = repaired ?? input;

	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed !== null && typeof parsed === 'object') {
			return { text: JSON.stringify(parsed, null, 2), repairedEncoding: repaired !== null, reformatted: true };
		}
	} catch {
		// Partial paste or hand-edited text: keep it verbatim so nothing the
		// operator typed is lost, and let the encoding repair stand alone.
	}

	return { text, repairedEncoding: repaired !== null, reformatted: false };
}
