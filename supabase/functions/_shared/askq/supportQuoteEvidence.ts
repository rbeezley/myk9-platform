import type { AskQGuideAsset } from './documentContext.ts';

export const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
export const SUPPORT_QUOTE_MARKER = 'SUPPORT_QUOTE';
export const SUPPORT_HANDOFF_MARKER = 'SUPPORT_HANDOFF';
export const MIN_QUOTE_WORDS = 8;
/**
 * MYK9-2472: a passage shorter than MIN_QUOTE_WORDS is still accepted when it is one whole guide
 * line or sentence of at least this many words. "Go to My Dogs in the navigation." is step 1 of
 * adding a dog and is 7 words; rejecting it rejected the whole answer.
 */
export const MIN_WHOLE_PASSAGE_WORDS = 4;
export const MAX_QUOTES = 3;
export const MAX_QUOTE_TOKENS = 120;

export interface VerifiedGuideQuote {
  id: string;
  title: string;
  audience: string;
  quote: string;
  /** Deep links read `content`; it carries the verified quote. */
  content: string;
}

export type SupportQuoteRefusal = 'handoff' | 'quote_rejected';

/** Which rule rejected the quotes. Logged so a refusal can be diagnosed; never shown to the user. */
export type SupportQuoteRejection =
  | 'no_quotes'
  | 'too_many_quotes'
  | 'malformed_quote'
  | 'unknown_guide'
  | 'quote_too_short'
  | 'quote_too_long'
  | 'quote_not_in_guide';

export type SupportQuoteVerification =
  | { ok: true; answerText: string; guideSources: VerifiedGuideQuote[] }
  | {
      ok: false;
      reason: SupportQuoteRefusal;
      detail?: SupportQuoteRejection;
      /** The quote text that failed `quote_not_in_guide`, so a retry can name it. */
      failedQuote?: string;
    };

const DECORATION = '\\s*_`#>\\-';
const ANSWER_LINE_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_ANSWER_MARKER}[\\s*_\`:]*(.*)$`);
const QUOTE_START_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}`);
const QUOTE_LINE_RE = new RegExp(
  `^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}[\\s*_\`]*\\[([^\\]]+)\\][\\s*_\`]*:?[\\s*_\`]*["“”](.+)["“”][\\s.,;:!?)*_\`]*$`
);

const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;

/**
 * Word tokens of markdown text: link text kept, list/heading markers and punctuation dropped.
 * A screenshot (`![alt](path)`) is no words at all, so a passage that runs on past one still
 * matches (MYK9-2472): the model copies the steps, not the picture between them.
 */
export function tokenizeQuoteText(text: string): string[] {
  return (
    text
      .replace(IMAGE_RE, ' ')
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

/**
 * Where one sentence ends and the next begins: after `.`, `!` or `?`, and after whatever closes
 * around it. In the guides a bold question ends `?**`, a quoted one `?"`, an aside `.)`, so
 * "punctuation then a space" alone misses those boundaries.
 */
const SENTENCE_BREAK_RE = /(?<=[.!?]["'“”‘’)\]*_`]*)\s+/;

/** True when `quoteTokens` is exactly one whole line, or one whole sentence, of the guide. */
function isWholeGuidePassage(guideContent: string, quoteTokens: string[]): boolean {
  const wanted = quoteTokens.join(' ');
  for (const line of guideContent.replace(IMAGE_RE, ' ').split('\n')) {
    if (tokenizeQuoteText(line).join(' ') === wanted) return true;
    for (const sentence of line.split(SENTENCE_BREAK_RE)) {
      if (tokenizeQuoteText(sentence).join(' ') === wanted) return true;
    }
  }
  return false;
}

/**
 * Plain-text form of a verified passage: markdown syntax removed, whitespace collapsed.
 * A screenshot goes first, caption and all: its words were never checked against the guide
 * (`tokenizeQuoteText` drops it), so they must not be shown either.
 */
export function toDisplayPassage(quote: string): string {
  return quote
    .replace(IMAGE_RE, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s*(?:[#>]+|[-*+]|\d{1,3}[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”]+|["“”]+$/g, '')
    .trim();
}

function formatAnswer(sources: VerifiedGuideQuote[]): string {
  const groups: VerifiedGuideQuote[][] = [];
  for (const source of sources) {
    const last = groups[groups.length - 1];
    if (last && last[0].id === source.id) last.push(source);
    else groups.push([source]);
  }
  return groups
    .map(g => [`From the ${g[0].title}:`, ...g.map(s => `“${s.quote}”`)].join('\n'))
    .join('\n\n');
}

/**
 * Accepts a support answer only when it starts with the answer marker and every
 * SUPPORT_QUOTE line (at most 3) is a long enough, word-for-word run of the guide
 * it names (or a shorter whole step or sentence of it). The shown answer is built from the verified passages alone; any prose
 * the model wrote is discarded.
 */
export function verifySupportAnswerQuotes(
  rawText: string,
  guides: AskQGuideAsset[]
): SupportQuoteVerification {
  const lines = rawText.replace(/\r\n?/g, '\n').trim().split('\n');
  const first = ANSWER_LINE_RE.exec(lines[0] ?? '');
  if (!first) return { ok: false, reason: 'handoff' };

  const proseLines: string[] = [first[1]];
  const quoteLines: string[] = [];
  for (const line of lines.slice(1)) {
    (QUOTE_START_RE.test(line) ? quoteLines : proseLines).push(line);
  }
  if (proseLines.some(l => l.includes(SUPPORT_HANDOFF_MARKER))) {
    return { ok: false, reason: 'handoff' };
  }
  const rejected = (detail: SupportQuoteRejection): SupportQuoteVerification => ({
    ok: false,
    reason: 'quote_rejected',
    detail,
  });
  if (quoteLines.length === 0) return rejected('no_quotes');
  if (quoteLines.length > MAX_QUOTES) return rejected('too_many_quotes');

  const guideSources: VerifiedGuideQuote[] = [];
  for (const line of quoteLines) {
    const match = QUOTE_LINE_RE.exec(line.trim());
    const id = match?.[1].trim().replace(/\.md$/i, '');
    const guide = id ? guides.find(g => g.id === id) : undefined;
    if (!match) return rejected('malformed_quote');
    if (!guide) return rejected('unknown_guide');

    const quote = match[2].trim();
    const quoteTokens = tokenizeQuoteText(quote);
    if (quoteTokens.length > MAX_QUOTE_TOKENS) return rejected('quote_too_long');
    if (!containsSequence(tokenizeQuoteText(guide.content), quoteTokens)) {
      return {
        ok: false,
        reason: 'quote_rejected',
        detail: 'quote_not_in_guide',
        failedQuote: quote,
      };
    }
    if (
      quoteTokens.length < MIN_QUOTE_WORDS &&
      !(
        quoteTokens.length >= MIN_WHOLE_PASSAGE_WORDS &&
        isWholeGuidePassage(guide.content, quoteTokens)
      )
    ) {
      return rejected('quote_too_short');
    }
    const display = toDisplayPassage(quote);
    if (!display) return rejected('malformed_quote');
    guideSources.push({
      id: guide.id,
      title: guide.title,
      audience: guide.audience,
      quote: display,
      content: display,
    });
  }

  return { ok: true, answerText: formatAnswer(guideSources), guideSources };
}
