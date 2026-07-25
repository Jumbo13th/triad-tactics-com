import { describe, expect, it } from 'vitest';
import { normalizeSlottingJsonText, repairWindows1252Mojibake } from '@/features/games/domain/slottingText';

// Captured from a real Arma lobby /slotexport paste: the mod's UTF-8 bytes read
// back as Windows-1252. Kept verbatim rather than generated, because Node's
// TextDecoder('windows-1252') decodes the 0x80-0x9F block as latin-1 and would
// not reproduce what Windows actually puts on the clipboard.
const REAL_MOJIBAKE = 'ÐšÐ¾Ð¼Ð°Ð½Ð´Ð¸Ñ€ Ð²Ð·Ð²Ð¾Ð´Ð°';
const REAL_TEXT = 'Командир взвода';

/** The other flavour of the same damage: bytes read as latin-1. */
function toLatin1Mojibake(text: string): string {
	return new TextDecoder('latin1').decode(new TextEncoder().encode(text));
}

describe('repairWindows1252Mojibake', () => {
	it('restores Cyrillic mangled by a single-byte clipboard', () => {
		expect(repairWindows1252Mojibake(REAL_MOJIBAKE)).toBe(REAL_TEXT);
	});

	it('restores bytes that land in the Windows-1252 0x80-0x9F block', () => {
		// "ё" is D1 91 and "К" is D0 9A — 0x91 and 0x9A are the curly quote and
		// "š", the bytes a plain latin-1 reverse mapping would lose.
		expect(repairWindows1252Mojibake('ÐŸÑƒÐ»ÐµÐ¼Ñ‘Ñ‚Ñ‡Ð¸Ðº ÐŸÐšÐŸ')).toBe('Пулемётчик ПКП');
	});

	it('restores the latin-1 flavour of the same damage', () => {
		expect(repairWindows1252Mojibake(toLatin1Mojibake('Снайпер СВДМ'))).toBe('Снайпер СВДМ');
	});

	it('leaves correctly encoded text alone', () => {
		expect(repairWindows1252Mojibake(REAL_TEXT)).toBeNull();
		expect(repairWindows1252Mojibake('Section Commander')).toBeNull();
		expect(repairWindows1252Mojibake('')).toBeNull();
	});

	it('leaves text alone when the bytes are not valid UTF-8', () => {
		expect(repairWindows1252Mojibake('café')).toBeNull();
	});
});

describe('normalizeSlottingJsonText', () => {
	it('repairs a mangled slotting document', () => {
		const result = normalizeSlottingJsonText(
			`{"sides":[{"name":"RHS_AFRF","squads":[{"name":"Aktiv 1 1","slots":[{"role":"${REAL_MOJIBAKE}"}]}]}]}`
		);

		expect(result.repairedEncoding).toBe(true);
		expect(result.reformatted).toBe(true);

		const parsed = JSON.parse(result.text) as { sides: Array<{ squads: Array<{ slots: Array<{ role: string }> }> }> };
		expect(parsed.sides[0].squads[0].slots[0].role).toBe(REAL_TEXT);
	});

	it('turns the lobby export escapes into readable text', () => {
		const escaped = '{"role":"\\u041a\\u043e\\u043c\\u0430\\u043d\\u0434\\u0438\\u0440 \\u0432\\u0437\\u0432\\u043e\\u0434\\u0430"}';
		const result = normalizeSlottingJsonText(escaped);

		expect(result.repairedEncoding).toBe(false);
		expect(result.text).toContain(REAL_TEXT);
	});

	it('leaves an already-clean document as valid JSON', () => {
		const source = JSON.stringify({ sides: [{ name: 'RHS_AFRF', role: REAL_TEXT }] });
		const result = normalizeSlottingJsonText(source);

		expect(result.repairedEncoding).toBe(false);
		expect(JSON.parse(result.text)).toEqual(JSON.parse(source));
	});

	it('keeps a non-JSON fragment verbatim', () => {
		const result = normalizeSlottingJsonText('"role": "Section Commander",');

		expect(result.reformatted).toBe(false);
		expect(result.text).toBe('"role": "Section Commander",');
	});

	it('repairs a fragment that is not valid JSON on its own', () => {
		const result = normalizeSlottingJsonText(`"role": "${REAL_MOJIBAKE}",`);

		expect(result.repairedEncoding).toBe(true);
		expect(result.text).toBe(`"role": "${REAL_TEXT}",`);
	});
});
