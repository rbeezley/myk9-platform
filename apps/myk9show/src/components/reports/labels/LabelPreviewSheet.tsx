import type React from 'react';
import type { LabelPage } from '@/lib/labels/labelLayout';
import type { LabelTemplate } from '@/lib/labels/labelTemplates';

// The preview is a picture of paper, so it never follows the app theme. Pinning
// white/black here keeps label text readable in dark mode and matches print.
const PAPER_BACKGROUND = '#fff';
const PAPER_TEXT = '#000';
const ITEM_BORDER = '1px solid #9ca3af';
const EMPTY_BORDER = '1px dashed #d1d5db';

interface LabelPreviewSheetProps<T> {
  page: LabelPage<T>;
  template: LabelTemplate;
  renderItem: (item: T) => React.ReactNode;
}

/** One paper-coloured page of the live label preview, shared by every label report. */
export function LabelPreviewSheet<T>({ page, template, renderItem }: LabelPreviewSheetProps<T>) {
  return (
    <div
      data-testid="label-preview-page"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidth}in)`,
        columnGap: `${template.gapX}in`,
        rowGap: `${template.gapY}in`,
        margin: '0 auto 16px',
        border: '1px dashed #9ca3af',
        padding: '8px',
        backgroundColor: PAPER_BACKGROUND,
        color: PAPER_TEXT,
      }}
    >
      {page.cells.map((cell, i) => (
        <div
          key={i}
          data-testid="label-preview-cell"
          style={{
            width: `${template.labelWidth}in`,
            height: `${template.labelHeight}in`,
            border: cell.type === 'item' ? ITEM_BORDER : EMPTY_BORDER,
            boxSizing: 'border-box',
            overflow: 'hidden',
            padding: '0.08in 0.12in',
            backgroundColor: PAPER_BACKGROUND,
            color: PAPER_TEXT,
          }}
        >
          {cell.type === 'item' && cell.item ? renderItem(cell.item) : null}
        </div>
      ))}
    </div>
  );
}
