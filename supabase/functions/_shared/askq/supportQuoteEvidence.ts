import type { AskQGuideAsset } from './documentContext.ts';

export const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
export const SUPPORT_QUOTE_MARKER = 'SUPPORT_QUOTE';
export const SUPPORT_HANDOFF_MARKER = 'SUPPORT_HANDOFF';
export const MIN_QUOTE_WORDS = 8;
/** A quote must share this many distinct content words with the answer it backs. */
export const MIN_SHARED_CONTENT_WORDS = 3;

export interface VerifiedGuideQuote {
  id: string;
  title: string;
  audience: string;
  quote: string;
  /** Deep links read `content`; it carries the verified quote. */
  content: string;
}

export type SupportQuoteRefusal = 'handoff' | 'quote_rejected';

export type SupportQuoteVerification =
  | { ok: true; answerText: string; guideSources: VerifiedGuideQuote[] }
  | { ok: false; reason: SupportQuoteRefusal };

const DECORATION = '\\s*_`#>\\-';
const ANSWER_LINE_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_ANSWER_MARKER}[\\s*_\`:]*(.*)$`);
const QUOTE_START_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}`);
const QUOTE_LINE_RE = new RegExp(
  `^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}[\\s*_\`]*\\[([^\\]]+)\\][\\s*_\`]*:?[\\s*_\`]*["“”](.+)["“”][\\s.,;:!?)*_\`]*$`
);
const STRAY_MARKER_RE = new RegExp(`${SUPPORT_ANSWER_MARKER}|${SUPPORT_QUOTE_MARKER}`, 'g');

const STOPWORDS = new Set(
  'that this with from then they them have your will when what each into also only been more than here there which does about would could should their these those where while after before'.split(
    ' '
  )
);

/** Word tokens of markdown text: link text kept, list/heading markers and punctuation dropped. */
export function tokenizeQuoteText(text: string): string[] {
  return (
    text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(^|\s)\d{1,3}[.)](?=\s)/gm, '$1 ')
      .replace(/[‘’]/g, "'")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  );
}

/** Readable flattened form of the same normalisation, for display and tests. */
export function normalizeQuoteText(text: string): string {
  return tokenizeQuoteText(text).join(' ');
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  const last = haystack.length - needle.length;
  for (let i = 0; i <= last; i++) {
    let j = 0;
    while (j < needle.length && haystack[i + j] === needle[j]) j++;
    if (j === needle.length) return true;
  }
  return false;
}

function contentWords(tokens: string[]): Set<string> {
  return new Set(tokens.filter(t => t.length >= 4 && !STOPWORDS.has(t)));
}

function sharesEnoughWords(quoteTokens: string[], answerWords: Set<string>): boolean {
  let shared = 0;
  for (const word of contentWords(quoteTokens)) if (answerWords.has(word)) shared++;
  return shared >= MIN_SHARED_CONTENT_WORDS;
}

/**
 * Accepts a support answer only when it starts with the answer marker and every
 * SUPPORT_QUOTE line is a long enough, word-for-word run of the guide it names
 * that also backs the answer's own content words.
 */
export function verifySupportAnswerQuotes(
  rawText: string,
  guides: AskQGuideAsset[]
): SupportQuoteVerification {
  const lines = rawText.replace(/\r\n?/g, '\n').trim().split('\n');
  const first = ANSWER_LINE_RE.exec(lines[0] ?? '');
  if (!first) return { ok: false, reason: 'handoff' };

  const answerLines: string[] = first[1].trim() ? [first[1].trim()] : [];
  const quoteLines: string[] = [];
  for (const line of lines.slice(1)) {
    (QUOTE_START_RE.test(line) ? quoteLines : answerLines).push(line);
  }

  const answerText = answerLines
    .join('\n')
    .replace(STRAY_MARKER_RE, '')
    .replace(/\*{2}\s*\*{2}/g, '')
    .trim();
  if (answerLines.some(l => l.includes(SUPPORT_HANDOFF_MARKER))) {
    return { ok: false, reason: 'handoff' };
  }
  const answerWords = contentWords(tokenizeQuoteText(answerText));
  const rejected: SupportQuoteVerification = { ok: false, reason: 'quote_rejected' };

  const guideSources: VerifiedGuideQuote[] = [];
  for (const line of quoteLines) {
    const match = QUOTE_LINE_RE.exec(line.trim());
    const id = match?.[1].trim().replace(/\.md$/i, '');
    const guide = id ? guides.find(g => g.id === id) : undefined;
    if (!match || !guide) return rejected;

    const quote = match[2].trim();
    const quoteTokens = tokenizeQuoteText(quote);
    if (
      quoteTokens.length < MIN_QUOTE_WORDS ||
      !containsSequence(tokenizeQuoteText(guide.content), quoteTokens) ||
      !sharesEnoughWords(quoteTokens, answerWords)
    ) {
      return rejected;
    }
    guideSources.push({
      id: guide.id,
      title: guide.title,
      audience: guide.audience,
      quote,
      content: quote,
    });
  }

  if (guideSources.length === 0 || !answerText) return rejected;
  return { ok: true, answerText, guideSources };
}
