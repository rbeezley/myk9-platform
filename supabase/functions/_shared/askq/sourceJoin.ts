import type { AskQSource } from './sourceClassifier.ts';

export const SHOW_DATA_LABEL = "This show's live data:";
export const NO_GUIDE_ANSWER_SENTENCE =
  'I could not find a verified guide answer for that question.';
const NO_RULEBOOK_SENTENCE = 'I could not find that in the official rulebook.';
const NO_SHOW_DATA_SENTENCE = "I could not find an answer to that in this show's data.";

export interface SourceSection {
  source: AskQSource;
  /** What the source produced; null when it produced nothing. */
  text: string | null;
}

const ORDER: AskQSource[] = ['show_data', 'guides', 'rulebook'];

function fallbackSentence(source: AskQSource): string {
  if (source === 'guides') return NO_GUIDE_ANSWER_SENTENCE;
  if (source === 'rulebook') return NO_RULEBOOK_SENTENCE;
  return NO_SHOW_DATA_SENTENCE;
}

/**
 * Joins the sources in a fixed order (show data, guides, rulebook). One source reads as
 * its own answer. With several, show data gets a plain label; the guides text already
 * starts "From the <guide>:" and the rulebook text "Using … rules:". A source that
 * produced nothing contributes one plain sentence.
 */
export function joinSourceSections(sections: SourceSection[]): string {
  const ordered = ORDER.flatMap(source => sections.filter(section => section.source === source));
  const multiple = ordered.length > 1;
  return ordered
    .map(section => {
      const text = section.text?.trim();
      if (!text) return fallbackSentence(section.source);
      return multiple && section.source === 'show_data' ? `${SHOW_DATA_LABEL}\n${text}` : text;
    })
    .join('\n\n');
}
