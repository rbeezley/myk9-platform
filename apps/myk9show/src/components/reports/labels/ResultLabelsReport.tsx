import React, { useState, useMemo, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import { LABEL_TEMPLATES, getAllTemplates, getLabelTemplate } from '@/lib/labels/labelTemplates';
import { buildLabelPages } from '@/lib/labels/labelLayout';
import { buildLabelStylesheet } from '@/lib/labels/labelStyles';
import { prepareResultLabelItems } from '@/lib/labels/resultLabelData';
import { mapScopedReportEntries } from '@/pages/secretary/ReportsPage/reportDataMapping';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { ResultLabelCell } from './ResultLabelCell';

// 4" × 2" (Avery #18163, 10/sheet) is the natural fit for result content
// (armband+name, handler, club, show/class, place/time/faults).
const DEFAULT_RESULT_TEMPLATE_ID = '18163';

interface ResultLabelsReportProps {
  show: Show | null | undefined;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  trialId: string;
  classId: string;
  sortOrder: string;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export const ResultLabelsReport: React.FC<ResultLabelsReportProps> = ({
  show,
  trials,
  classes,
  entries,
  trialId,
  classId,
  sortOrder,
  iframeRef,
}) => {
  const [templateId, setTemplateId] = useState(DEFAULT_RESULT_TEMPLATE_ID);
  const [skip, setSkip] = useState(0);
  const [pitch, setPitch] = useState(0);

  const template =
    LABEL_TEMPLATES[templateId] ??
    getLabelTemplate(DEFAULT_RESULT_TEMPLATE_ID) ??
    getAllTemplates()[0];

  const items = useMemo(() => {
    // Scope + enrich each entry with its OWN trial/class (handles the
    // classId === 'all' case where useReportData returns all show entries).
    const enriched = mapScopedReportEntries(
      entries ?? [],
      trials ?? [],
      classes ?? [],
      trialId,
      classId
    );
    return prepareResultLabelItems(enriched, sortOrder, {
      showName: show?.name ?? '',
      ...(show?.clubName ? { clubName: show.clubName } : {}),
    });
  }, [entries, trials, classes, trialId, classId, sortOrder, show]);

  const pages = useMemo(() => buildLabelPages(template, items, skip), [template, items, skip]);

  // Write the print-ready sheet into the hidden iframe. The cell content uses
  // inline styles, so serializing it here preserves the exact layout; the
  // stylesheet only supplies the fixed-dimension grid + @page geometry.
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;

    // Clear any previously-written labels first; switching from a populated
    // class to an empty one must not leave a stale sheet that Print would emit.
    if (pages.length === 0) {
      iframe.contentDocument?.open();
      iframe.contentDocument?.write('<!DOCTYPE html><html><head></head><body></body></html>');
      iframe.contentDocument?.close();
      return;
    }

    const sheetsHtml = pages
      .map(page => {
        const cellsHtml = page.cells
          .map(cell => {
            if (cell.type !== 'item' || !cell.item) {
              return `<div class="label-cell label-cell--${cell.type}"></div>`;
            }
            const cellMarkup = ReactDOMServer.renderToStaticMarkup(
              <ResultLabelCell item={cell.item} />
            );
            return `<div class="label-cell">${cellMarkup}</div>`;
          })
          .join('');
        return `<div class="label-sheet">${cellsHtml}</div>`;
      })
      .join('');

    const css = buildLabelStylesheet(template, pitch);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Result Labels</title><style>${css}</style></head><body>${sheetsHtml}</body></html>`;

    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
  }, [pages, template, pitch, iframeRef]);

  const templates = getAllTemplates();

  return (
    <div className="w-full max-w-[8.5in] mx-auto">
      <div className="border rounded-lg bg-muted/30 p-4 mb-6 space-y-4">
        {/* Label size */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Label Size
          </div>
          <div className="flex flex-col gap-1.5">
            {templates.map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="resultLabelTemplate"
                  checked={templateId === t.id}
                  onChange={() => setTemplateId(t.id)}
                />
                {t.name} — {t.labelsPerSheet}/sheet
              </label>
            ))}
          </div>
        </div>

        {/* Skip + summary */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>Labels to skip on first page:</span>
            <input
              type="number"
              min={0}
              max={template.labelsPerSheet - 1}
              value={skip}
              onChange={e => setSkip(Math.max(0, Number(e.target.value)))}
              className="w-16 px-2 py-0.5 border rounded text-sm"
              aria-label="Labels to skip on first page"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {items.length} label{items.length !== 1 ? 's' : ''} on {pages.length} page
            {pages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Pitch adjustment — corrects printer drift toward the bottom of the sheet */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Vertical Pitch Adjustment
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            If labels drift out of alignment toward the bottom of the page, nudge this. Positive =
            more space between rows, negative = less.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={pitch}
              onChange={e => setPitch(Number(e.target.value))}
              className="w-48"
              aria-label="Vertical pitch adjustment"
            />
            <span className="text-sm font-mono w-20">
              {pitch > 0 ? '+' : ''}
              {pitch}/1000&quot;
            </span>
            {pitch !== 0 && (
              <button
                type="button"
                onClick={() => setPitch(0)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          No entries to print labels for in this selection.
        </div>
      )}

      {/* Live preview — fixed-dimension cells matching the chosen stock */}
      {pages.map(page => (
        <div
          key={page.pageNumber}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidth}in)`,
            columnGap: `${template.gapX}in`,
            rowGap: `${template.gapY}in`,
            margin: '0 auto 16px',
            border: '1px dashed #ddd',
            padding: '8px',
          }}
        >
          {page.cells.map((cell, i) => (
            <div
              key={i}
              style={{
                width: `${template.labelWidth}in`,
                height: `${template.labelHeight}in`,
                border: cell.type === 'item' ? '1px solid #eee' : '1px dashed #f0f0f0',
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding: '0.08in 0.12in',
              }}
            >
              {cell.type === 'item' && cell.item && <ResultLabelCell item={cell.item} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
