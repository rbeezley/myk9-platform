import React, { useState, useMemo, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  LABEL_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getAllTemplates,
} from '@/lib/labels/labelTemplates';
import { buildLabelPages } from '@/lib/labels/labelLayout';
import { buildLabelStylesheet } from '@/lib/labels/labelStyles';
import {
  prepareArmbandLabelItems,
  filterEntries,
} from '@/lib/labels/armbandLabelData';
import type {
  LabelContentConfig,
  LabelFilterConfig,
} from '@/lib/labels/armbandLabelTypes';
import { ArmbandLabelCell } from './ArmbandLabelCell';
import { generatePasscodesFromShowId } from '@myk9/core';
import { useLabelPreferences } from '@/hooks/useLabelPreferences';
import { useArmbandLabelData } from '@/hooks/queries/useArmbandLabelData';

interface ArmbandLabelsReportProps {
  showId: string | undefined;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export const ArmbandLabelsReport: React.FC<ArmbandLabelsReportProps> = ({
  showId,
  iframeRef: externalIframeRef,
}) => {
  const [prefs, setPrefs] = useLabelPreferences();
  const [filter, setFilter] = useState<LabelFilterConfig>({
    earlyEntries: true,
    dayOfShowEntries: true,
  });
  const [specificArmband, setSpecificArmband] = useState('');
  const [showSpecific, setShowSpecific] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Derive from prefs — single source of truth
  const templateId = prefs.templateId ?? DEFAULT_TEMPLATE_ID;
  const config = prefs.contentConfig;
  const skip = prefs.skip;
  const pitchAdjustment = prefs.pitchAdjustment;

  const {
    entries: allEntries,
    wifiNetwork,
    wifiPassword,
    isLoading,
  } = useArmbandLabelData(showId);
  const template = LABEL_TEMPLATES[templateId];
  const passcodes = useMemo(
    () => (showId ? generatePasscodesFromShowId(showId) : null),
    [showId]
  );

  const filterConfig: LabelFilterConfig = useMemo(
    () => ({
      ...filter,
      specificArmband:
        showSpecific && specificArmband ? Number(specificArmband) : null,
    }),
    [filter, showSpecific, specificArmband]
  );

  const filtered = useMemo(
    () => filterEntries(allEntries, filterConfig),
    [allEntries, filterConfig]
  );
  const items = useMemo(
    () => prepareArmbandLabelItems(filtered),
    [filtered]
  );
  const pages = useMemo(
    () => buildLabelPages(template, items, skip),
    [template, items, skip]
  );

  const sharedCellProps = useMemo(
    () => ({
      config,
      labelHeight: template.labelHeight,
      passcode: passcodes?.exhibitor,
      wifiNetwork: config.venueWifi ? (wifiNetwork ?? undefined) : undefined,
      wifiPassword: config.venueWifi ? (wifiPassword ?? undefined) : undefined,
    }),
    [config, template.labelHeight, passcodes, wifiNetwork, wifiPassword]
  );

  useEffect(() => {
    const iframe = externalIframeRef?.current;
    if (!iframe || pages.length === 0) return;

    const sheetsHtml = pages
      .map((page) => {
        const cellsHtml = page.cells
          .map((cell) => {
            if (cell.type !== 'item' || !cell.item) {
              return `<div class="label-cell label-cell--${cell.type}"></div>`;
            }
            const cellMarkup = ReactDOMServer.renderToStaticMarkup(
              <ArmbandLabelCell item={cell.item} {...sharedCellProps} />
            );
            return `<div class="label-cell">${cellMarkup}</div>`;
          })
          .join('');
        return `<div class="label-sheet">${cellsHtml}</div>`;
      })
      .join('');

    const css = buildLabelStylesheet(template, pitchAdjustment);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Armband Labels</title><style>${css}</style></head><body>${sheetsHtml}</body></html>`;

    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
  }, [pages, sharedCellProps, template, pitchAdjustment, externalIframeRef]);

  const updateConfig = (key: keyof LabelContentConfig, value: boolean) => {
    setPrefs((p) => ({
      ...p,
      contentConfig: { ...p.contentConfig, [key]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading entry data...
      </div>
    );
  }

  const wifiAvailable = !!wifiNetwork;
  const templates = getAllTemplates();

  return (
    <div className="w-full max-w-[8.5in] mx-auto">
      <div className="border rounded-lg bg-muted/30 p-4 mb-6 space-y-4">
        {/* Label Size */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Label Size
          </div>
          <div className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="labelTemplate"
                  checked={templateId === t.id}
                  onChange={() =>
                    setPrefs((p) => ({ ...p, templateId: t.id }))
                  }
                />
                {t.name} — {t.labelsPerSheet}/sheet
              </label>
            ))}
          </div>
        </div>

        {/* Entry Filter */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Select Armbands to Print
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filter.earlyEntries}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, earlyEntries: e.target.checked }))
                }
              />
              Early Entries
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filter.dayOfShowEntries}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    dayOfShowEntries: e.target.checked,
                  }))
                }
              />
              Day of Show Entries
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showSpecific}
                onChange={(e) => {
                  setShowSpecific(e.target.checked);
                  if (!e.target.checked) setSpecificArmband('');
                }}
              />
              Specific Armband Number
              {showSpecific && (
                <input
                  type="number"
                  value={specificArmband}
                  onChange={(e) => setSpecificArmband(e.target.value)}
                  className="w-20 ml-2 px-2 py-0.5 border rounded text-sm"
                  placeholder="#"
                  aria-label="Armband number"
                />
              )}
            </label>
          </div>
        </div>

        {/* Content Config */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Include on Label
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.callName}
                onChange={(e) => updateConfig('callName', e.target.checked)}
              />
              Dog&apos;s Call Name
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.trialDate}
                onChange={(e) => updateConfig('trialDate', e.target.checked)}
              />
              Trial Date
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.handlerName}
                onChange={(e) => updateConfig('handlerName', e.target.checked)}
              />
              Handler&apos;s Name
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" disabled />
              Club Logo (coming soon)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.myk9qCode}
                onChange={(e) => updateConfig('myk9qCode', e.target.checked)}
              />
              myK9Q Access Code
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${!wifiAvailable ? 'text-muted-foreground' : ''}`}
            >
              <input
                type="checkbox"
                checked={config.venueWifi}
                onChange={(e) => updateConfig('venueWifi', e.target.checked)}
                disabled={!wifiAvailable}
              />
              Venue WiFi {!wifiAvailable && '(not configured)'}
            </label>
          </div>
        </div>

        {/* Skip + Summary */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>Labels to skip on first page:</span>
            <input
              type="number"
              min={0}
              max={template.labelsPerSheet - 1}
              value={skip}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  skip: Math.max(0, Number(e.target.value)),
                }))
              }
              className="w-16 px-2 py-0.5 border rounded text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {items.length} label{items.length !== 1 ? 's' : ''} on{' '}
            {pages.length} page{pages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Advanced — Pitch Adjustment */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-2 p-3 border rounded bg-background space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Vertical Pitch Adjustment
              </div>
              <p className="text-xs text-muted-foreground">
                If labels drift out of alignment toward the bottom of the page,
                adjust this value. Positive = more space between rows, negative =
                less. Saved per browser.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-20}
                  max={20}
                  value={pitchAdjustment}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      pitchAdjustment: Number(e.target.value),
                    }))
                  }
                  className="w-48"
                />
                <span className="text-sm font-mono w-20">
                  {pitchAdjustment > 0 ? '+' : ''}
                  {pitchAdjustment}/1000&quot;
                </span>
                {pitchAdjustment !== 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, pitchAdjustment: 0 }))
                    }
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && !isLoading && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          {allEntries.length === 0
            ? 'No entries with armbands assigned for this show'
            : showSpecific && specificArmband
              ? `No entry found with armband #${specificArmband}`
              : 'No entries match the selected filters'}
        </div>
      )}

      {/* Live label preview */}
      {pages.map((page) => (
        <div
          key={page.pageNumber}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidth}in)`,
            columnGap: `${template.gapX}in`,
            rowGap: `${template.gapY}in`,
            margin: '0 auto',
            marginBottom: '16px',
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
                border:
                  cell.type === 'item'
                    ? '1px solid #eee'
                    : '1px dashed #f0f0f0',
                boxSizing: 'border-box',
                overflow: 'hidden',
                padding: '0.08in 0.12in',
              }}
            >
              {cell.type === 'item' && cell.item && (
                <ArmbandLabelCell item={cell.item} {...sharedCellProps} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
