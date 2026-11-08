/**
 * Block parser for the AskQ Markdown subset (MYK9-1774). Pure text in, plain
 * data out; AskQMarkdown.tsx turns the blocks into React elements.
 */

export interface ListItem {
  text: string;
  /** Indented bullets under a numbered step belong to that step. */
  sub: string[];
}

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'rule' }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'paragraph'; lines: string[] };

const HEADING = /^\s*#+(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+•]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/** Heading text with its `#` markers removed, or null when the line is not a heading. */
export function stripHeading(line: string): string | null {
  const match = HEADING.exec(line);
  return match ? (match[1] ?? '') : null;
}

function tableRowText(line: string): string {
  return line
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean)
    .join(' · ');
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: ListItem[] } | null = null;
  let inFence = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list });
    list = null;
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) {
      flushParagraph();
      flushList();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (line.trim() !== '') paragraph.push(stripHeading(line) ?? line.trim());
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const isRule = RULE.test(line);
    const nested = !!bullet && bullet[1].length >= 2 && !!list && list.items.length > 0;
    const continuesList =
      !isRule && !!list && ((bullet && (!list.ordered || nested)) || (numbered && list.ordered));
    if (list && !continuesList) flushList();

    if (TABLE_SEPARATOR.test(line) && line.includes('|')) continue;
    const heading = stripHeading(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      if (heading) blocks.push({ kind: 'heading', text: heading });
      continue;
    }
    if (isRule) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'rule' });
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      const itemText = (bullet ? bullet[2] : numbered![3]).trim();
      const content = stripHeading(itemText) ?? itemText;
      if (list && list.ordered && bullet && nested) {
        list.items[list.items.length - 1].sub.push(content);
        continue;
      }
      list ??= { ordered, start: numbered ? Number(numbered[2]) : 1, items: [] };
      list.items.push({ text: content, sub: [] });
      continue;
    }
    flushList();
    paragraph.push(TABLE_ROW.test(line) ? tableRowText(line) : line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}
