import type { ReactNode } from 'react';

import { parseBlocks } from './AskQMarkdownParse';

/**
 * A deliberately tiny, safe Markdown subset for AskQ answers (MYK9-1774).
 *
 * The model replies in Markdown; exhibitors must never see `##`, `**` or `---`.
 * Everything is built as React elements, so raw HTML is escaped as plain text
 * (no dangerouslySetInnerHTML), and links are reduced to plain text (no anchors).
 * Supported: headings (shown as bold lines), bold, italic, bullet and numbered
 * lists, `---` rules, and fences/tables flattened to plain text. Anything else
 * renders as ordinary text.
 */

const INLINE = new RegExp(
  [
    String.raw`!\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))*\)`, // 1 image alt
    String.raw`\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)`, // 2 label, 3 url
    String.raw`\*\*\*(.+?)\*\*\*`, // 4 bold italic
    String.raw`\*\*(.+?)\*\*`, // 5 bold
    String.raw`__(.+?)__`, // 6 bold
    String.raw`\*([^*\s][^*]*?)\*`, // 7 italic
    String.raw`(?<![A-Za-z0-9_])_([^_\s][^_]*?)_(?![A-Za-z0-9_])`, // 8 italic
  ].join('|'),
  'g'
);

/** Drops any marker characters left unmatched, e.g. a `**` still streaming in. */
function stripStrayMarkers(text: string): string {
  return text.replace(/\*|`|__/g, '');
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(stripStrayMarkers(text.slice(last, match.index)));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      nodes.push(stripStrayMarkers(match[1]));
    } else if (match[2] !== undefined) {
      nodes.push(...renderInline(match[2], key));
      if (/^(https:|mailto:)/i.test(match[3])) nodes.push(` (${match[3]})`);
    } else if (match[4] !== undefined) {
      nodes.push(
        <strong key={key}>
          <em>{renderInline(match[4], key)}</em>
        </strong>
      );
    } else if (match[5] !== undefined || match[6] !== undefined) {
      nodes.push(<strong key={key}>{renderInline(match[5] ?? match[6], key)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderInline(match[7] ?? match[8], key)}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(stripStrayMarkers(text.slice(last)));
  return nodes;
}

/** `trailing` (the streaming cursor) is placed inline at the end of the last block. */
export function AskQMarkdown({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const blocks = parseBlocks(text);
  const lastIndex = blocks.length - 1;
  const tail = (i: number) => (i === lastIndex ? trailing : null);
  const lastIsRule = blocks[lastIndex]?.kind === 'rule';
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.kind) {
          case 'heading':
            return (
              <p key={key} role="heading" aria-level={3} className="font-semibold">
                {renderInline(block.text, key)}
                {tail(i)}
              </p>
            );
          case 'rule':
            return <hr key={key} className="border-border/60" />;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={key}
                start={block.ordered && block.start !== 1 ? block.start : undefined}
                className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>
                    {renderInline(item.text, `${key}-${j}`)}
                    {item.sub.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5">
                        {item.sub.map((sub, k) => (
                          <li key={`${key}-${j}-${k}`}>{renderInline(sub, `${key}-${j}-${k}`)}</li>
                        ))}
                      </ul>
                    )}
                    {j === block.items.length - 1 && tail(i)}
                  </li>
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
                {tail(i)}
              </p>
            );
        }
      })}
      {(blocks.length === 0 || lastIsRule) && trailing ? <p>{trailing}</p> : null}
    </div>
  );
}
