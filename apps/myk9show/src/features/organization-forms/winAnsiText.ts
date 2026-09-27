import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * A small set of common non-WinAnsi Latin letters that Unicode NFKD does not
 * decompose into a base letter + combining mark (they're distinct letters,
 * not accented forms), so the decomposition fallback below can't reach them.
 */
const TRANSLITERATION_MAP: Record<string, string> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
};

const COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;

let winAnsiCodePointsPromise: Promise<Set<number>> | null = null;

function getWinAnsiCodePoints(): Promise<Set<number>> {
  if (!winAnsiCodePointsPromise) {
    winAnsiCodePointsPromise = (async () => {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      return new Set(font.getCharacterSet());
    })();
  }
  return winAnsiCodePointsPromise;
}

function canEncode(char: string, winAnsiCodePoints: Set<number>): boolean {
  const codePoint = char.codePointAt(0);
  return codePoint != null && winAnsiCodePoints.has(codePoint);
}

/**
 * Makes a string safe to pass to a pdf-lib WinAnsi-encoded standard font
 * (`form.getTextField().setText()`, `page.drawText()`): pdf-lib throws at
 * `pdf.save()` on the first character WinAnsi can't encode, which fails the
 * WHOLE document rather than just one field (MYK9-846).
 *
 * Characters WinAnsi already encodes (including accented Latin-1 letters
 * like the "ë" and "ü" in "Zoë Müller") pass through unchanged. A non-WinAnsi
 * Latin letter is transliterated to ASCII where possible (NFKD decomposition
 * for accented forms, plus `TRANSLITERATION_MAP` for letters like "Ł" that
 * don't decompose). Anything left unencodable, such as an emoji, is dropped.
 */
export async function toWinAnsiSafeText(value: string): Promise<string> {
  const winAnsiCodePoints = await getWinAnsiCodePoints();
  let result = '';

  for (const char of value) {
    if (canEncode(char, winAnsiCodePoints)) {
      result += char;
      continue;
    }

    const mapped = TRANSLITERATION_MAP[char];
    if (mapped != null) {
      result += mapped;
      continue;
    }

    const decomposed = char.normalize('NFKD').replace(COMBINING_MARKS_PATTERN, '');
    if (decomposed.length > 0 && [...decomposed].every(c => canEncode(c, winAnsiCodePoints))) {
      result += decomposed;
      continue;
    }
    // Unencodable with no transliteration (e.g. an emoji) — drop it rather
    // than let it take down the whole PDF at save time.
  }

  return result;
}
