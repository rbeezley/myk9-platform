/**
 * Safety net for AskQ answers (MYK9-1774). The prompts ask for plain text; if
 * the model uses Markdown anyway, strip only the markers that read as noise.
 * Deliberately narrow: a lone `*` or `_` (footnotes, "2 * $35", fee_total),
 * links, URLs and line breaks are never touched, and lines are never re-flowed.
 */
export function cleanAskQAnswer(text: string): string {
  return text
    .split('\n')
    .map(line => {
      // A rule line (---, ***, ___) or a table separator (|---|---|) becomes blank.
      if (/^\s*([-*_]{3,}|\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?)\s*$/.test(line)) return '';
      return line.replace(/^\s{0,3}#{1,6}(?:[ \t]+|$)/, '');
    })
    .join('\n')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/\*\*(?=[^*\n]*$)/, '');
}
