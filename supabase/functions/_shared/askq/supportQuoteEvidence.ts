import type { AskQGuideAsset } from './documentContext.ts';

export const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
export const SUPPORT_QUOTE_MARKER = 'SUPPORT_QUOTE';
export const MIN_QUOTE_WORDS = 8;

export interface VerifiedGuideQuote {
  id: string;
  title: string;
  audience: string;
  quote: string;
  /** Deep links read `content`; it carries the verified quote. */
  content: string;
}

export type SupportQuoteVerification =
  { ok: true; answerText: string; guideSources: VerifiedGuideQuote[] } | { ok: false };

const QUOTE_LINE_RE = /^SUPPORT_QUOTE\s*\[([^\]]+)\]\s*:\s*["“”](.+?)["“”]?\s*$/;

/** Flattens markdown and typography so a copied sentence compares equal to its source. */
export function normalizeQuoteText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)?/gm, '')
    .replace(/[*`]+/g, '')
    .replace(/(^|[^A-Za-z0-9])_+|_+(?=[^A-Za-z0-9]|$)/g, '$1')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Accepts a support answer only when it starts with the answer marker and every
 * SUPPORT_QUOTE line is a real, long enough substring of the guide it names.
 */
export function verifySupportAnswerQuotes(
  rawText: string,
  guides: AskQGuideAsset[]
): SupportQuoteVerification {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith(SUPPORT_ANSWER_MARKER)) return { ok: false };

  const answerLines: string[] = [];
  const guideSources: VerifiedGuideQuote[] = [];
  for (const line of trimmed.slice(SUPPORT_ANSWER_MARKER.length).split('\n')) {
    if (!line.trim().startsWith(SUPPORT_QUOTE_MARKER)) {
      answerLines.push(line);
      continue;
    }
    const match = QUOTE_LINE_RE.exec(line.trim());
    const guide = match ? guides.find(g => g.id === match[1].trim()) : undefined;
    if (!match || !guide) return { ok: false };

    const quote = match[2].trim();
    const normalizedQuote = normalizeQuoteText(quote);
    const wordCount = normalizedQuote.split(' ').filter(Boolean).length;
    if (
      wordCount < MIN_QUOTE_WORDS ||
      !normalizeQuoteText(guide.content).includes(normalizedQuote)
    ) {
      return { ok: false };
    }
    guideSources.push({
      id: guide.id,
      title: guide.title,
      audience: guide.audience,
      quote,
      content: quote,
    });
  }

  const answerText = answerLines.join('\n').trim();
  if (guideSources.length === 0 || !answerText) return { ok: false };
  return { ok: true, answerText, guideSources };
}
