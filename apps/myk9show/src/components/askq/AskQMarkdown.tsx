import type { ReactNode } from 'react';

/**
 * A deliberately tiny, safe Markdown subset for AskQ answers (MYK9-1774).
 *
 * The model replies in Markdown; exhibitors must never see `##`, `**` or `---`.
 * Everything is built as React elements, so raw HTML is escaped as plain text
 * (no dangerouslySetInnerHTML), and links are reduced to their label (no anchors).
 * Supported: headings (shown as bold lines), **bold**, *italic*, `-`/`*`/`1.`
 * lists, and `---` rules. Anything else renders as ordinary text.
 */

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'rule' }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list });
    list = null;
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/g;

/** Drops any marker characters left unmatched, e.g. a `**` still streaming in. */
function stripStrayMarkers(text: string): string {
  return text.replace(/\*\*|`/g, '');
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(stripStrayMarkers(text.slice(last, match.index)));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      nodes.push(<strong key={key}>{stripStrayMarkers(match[1])}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key}>{stripStrayMarkers(match[2])}</em>);
    } else {
      nodes.push(stripStrayMarkers(match[3]));
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(stripStrayMarkers(text.slice(last)));
  return nodes;
}

export function AskQMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.kind) {
          case 'heading':
            return (
              <p key={key} className="font-semibold">
                {renderInline(block.text, key)}
              </p>
            );
          case 'rule':
            return <hr key={key} className="border-border/60" />;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={key}
                className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case 'paragraph':
            return (
              <p key={key}>
                {block.lines.flatMap((line, j) => [
                  ...(j > 0 ? [<br key={`${key}-br${j}`} />] : []),
                  ...renderInline(line, `${key}-${j}`),
                ])}
              </p>
            );
        }
      })}
    </div>
  );
}
