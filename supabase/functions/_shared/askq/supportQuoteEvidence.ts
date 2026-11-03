import type { AskQGuideAsset } from './documentContext.ts';

export const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
export const SUPPORT_QUOTE_MARKER = 'SUPPORT_QUOTE';
export const SUPPORT_HANDOFF_MARKER = 'SUPPORT_HANDOFF';
export const MIN_QUOTE_WORDS = 8;
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

export type SupportQuoteVerification =
  | { ok: true; answerText: string; guideSources: VerifiedGuideQuote[] }
  | { ok: false; reason: SupportQuoteRefusal };

const DECORATION = '\\s*_`#>\\-';
const ANSWER_LINE_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_ANSWER_MARKER}[\\s*_\`:]*(.*)$`);
const QUOTE_START_RE = new RegExp(`^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}`);
const QUOTE_LINE_RE = new RegExp(
  `^[${DECORATION}]*${SUPPORT_QUOTE_MARKER}[\\s*_\`]*\\[([^\\]]+)\\][\\s*_\`]*:?[\\s*_\`]*["“”](.+)["“”][\\s.,;:!?)*_\`]*$`
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

/** Plain-text form of a verified passage: markdown syntax removed, whitespace collapsed. */
export function toDisplayPassage(quote: string): string {
  return quote
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
 * it names. The shown answer is built from the verified passages alone; any prose
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
  const rejected: SupportQuoteVerification = { ok: false, reason: 'quote_rejected' };
  if (quoteLines.length === 0 || quoteLines.length > MAX_QUOTES) return rejected;

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
      quoteTokens.length > MAX_QUOTE_TOKENS ||
      !containsSequence(tokenizeQuoteText(guide.content), quoteTokens)
    ) {
      return rejected;
    }
    const display = toDisplayPassage(quote);
    if (!display) return rejected;
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
