import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactDOMServer from 'react-dom/server';
import { LABEL_TEMPLATES, DEFAULT_TEMPLATE_ID, getAllTemplates } from '@/lib/labels/labelTemplates';
import { buildLabelPages } from '@/lib/labels/labelLayout';
import { buildLabelStylesheet } from '@/lib/labels/labelStyles';
import {
  prepareArmbandLabelItems,
  filterEntries,
  selectArmbandLabelEntries,
} from '@/lib/labels/armbandLabelData';
import type { LabelContentConfig, LabelFilterConfig } from '@/lib/labels/armbandLabelTypes';
import type { ReportScope } from '@/lib/reports/types';
import {
  buildArmbandPaperworkDescriptor,
  type PaperworkDescriptor,
} from '@/features/show-map/cockpit/paperworkPrintState';
import { ArmbandLabelCell } from './ArmbandLabelCell';
import { LabelSetupSection, SetupEyebrow } from './LabelModeChrome';
import { LabelCalibrationPanel } from './LabelCalibrationPanel';
import { generatePasscodesFromShowId } from '@myk9/core';
import { useLabelPreferences } from '@/hooks/useLabelPreferences';
import { useArmbandLabelData } from '@/hooks/queries/useArmbandLabelData';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';

// A full-width, 44px-tall tappable row keeps native-sized controls but gives
// each option a mobile-friendly hit area (WCAG 2.5.5 / 44px touch floor).
const TAP_ROW = 'flex items-center gap-2 min-h-[44px] text-sm cursor-pointer';

interface ArmbandLabelsReportProps {
  showId: string | undefined;
  scope: ReportScope;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  onDescriptorChange?: ((descriptor: PaperworkDescriptor | null) => void) | undefined;
}

export const ArmbandLabelsReport: React.FC<ArmbandLabelsReportProps> = ({
  showId,
  scope,
  iframeRef: externalIframeRef,
  onDescriptorChange,
}) => {
  const [prefs, setPrefs] = useLabelPreferences();
  const [filter, setFilter] = useState<LabelFilterConfig>({
    earlyEntries: true,
    dayOfShowEntries: true,
  });
  const [specificArmband, setSpecificArmband] = useState('');
  const [showSpecific, setShowSpecific] = useState(false);

  // Derive from prefs — single source of truth
  const templateId = prefs.templateId ?? DEFAULT_TEMPLATE_ID;
  const config = prefs.contentConfig;
  const skip = prefs.skip;
  const pitchAdjustment = prefs.pitchAdjustment;
  const offsetTop = prefs.offsetTop;
  const offsetLeft = prefs.offsetLeft;

  const { entries: allEntries, wifiNetwork, wifiPassword, isLoading } = useArmbandLabelData(showId);
  const template = LABEL_TEMPLATES[templateId];
  const passcodes = useMemo(() => (showId ? generatePasscodesFromShowId(showId) : null), [showId]);

  const filterConfig: LabelFilterConfig = useMemo(
    () => ({
      ...filter,
      specificArmband: showSpecific && specificArmband ? Number(specificArmband) : null,
    }),
    [filter, showSpecific, specificArmband]
  );

  const filteredCandidates = useMemo(
    () =>
      filterEntries(
        allEntries.filter(entry => {
          if (scope.kind === 'class') return entry.classId === scope.classId;
          if (scope.kind === 'trial') return entry.trialId === scope.trialId;
          return true;
        }),
        filterConfig
      ),
    [allEntries, filterConfig, scope]
  );
  const filtered = useMemo(
    () => selectArmbandLabelEntries(filteredCandidates, { kind: 'show', showId: scope.showId }),
    [filteredCandidates, scope.showId]
  );
  const items = useMemo(() => prepareArmbandLabelItems(filtered), [filtered]);
  const paperworkDescriptor = useMemo(
    () =>
      filtered.length === 0
        ? null
        : buildArmbandPaperworkDescriptor(
            scope,
            filtered.map(entry => ({
              dogId: entry.dogId,
              calendarDay: entry.calendarDay,
              armband: entry.armband,
              callName: entry.callName,
              handlerName: entry.handler,
              classIds: filteredCandidates
                .filter(
                  candidate =>
                    (candidate.dogId || `armband:${candidate.armband}`) ===
                      (entry.dogId || `armband:${entry.armband}`) &&
                    candidate.calendarDay === entry.calendarDay
                )
                .map(candidate => candidate.classId),
              trialIds: filteredCandidates
                .filter(
                  candidate =>
                    (candidate.dogId || `armband:${candidate.armband}`) ===
                      (entry.dogId || `armband:${entry.armband}`) &&
                    candidate.calendarDay === entry.calendarDay
                )
                .map(candidate => candidate.trialId),
            }))
          ),
    [filtered, filteredCandidates, scope]
  );
  const pages = useMemo(() => buildLabelPages(template, items, skip), [template, items, skip]);

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

  const writeLabelIframe = useCallback(() => {
    const iframe = externalIframeRef?.current;
    if (!iframe || pages.length === 0) return;

    const sheetsHtml = pages
      .map(page => {
        const cellsHtml = page.cells
          .map(cell => {
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

    const css = buildLabelStylesheet(template, pitchAdjustment, offsetTop, offsetLeft);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Armband Labels</title><style>${css}</style></head><body>${sheetsHtml}</body></html>`;

    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
  }, [pages, sharedCellProps, template, pitchAdjustment, offsetTop, offsetLeft, externalIframeRef]);

  useEffect(() => {
    writeLabelIframe();
  }, [writeLabelIframe]);

  useEffect(() => {
    onDescriptorChange?.(paperworkDescriptor);
  }, [onDescriptorChange, paperworkDescriptor]);

  const updateConfig = (key: keyof LabelContentConfig, value: boolean) => {
    setPrefs(p => ({
      ...p,
      contentConfig: { ...p.contentConfig, [key]: value },
    }));
  };

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center p-8 text-muted-foreground"
      >
        Loading entry data...
      </div>
    );
  }

  const wifiAvailable = !!wifiNetwork;
  const templates = getAllTemplates();

  return (
    <div className="w-full max-w-[8.5in] mx-auto">
      <LabelSetupSection>
        {/* Label Size */}
        <div>
          <SetupEyebrow className="mb-2">Label Size</SetupEyebrow>
          <RadioGroup
            value={templateId}
            onValueChange={(id: string) => setPrefs(p => ({ ...p, templateId: id }))}
          >
            {templates.map(t => (
              <label key={t.id} htmlFor={`armband-tpl-${t.id}`} className={TAP_ROW}>
                <RadioGroupItem value={t.id} id={`armband-tpl-${t.id}`} />
                <span>
                  {t.name} — {t.labelsPerSheet}/sheet
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Entry Filter */}
        <div>
          <SetupEyebrow className="mb-2">Select Armbands to Print</SetupEyebrow>
          <div className="flex flex-col">
            <label htmlFor="armband-early" className={TAP_ROW}>
              <Checkbox
                id="armband-early"
                checked={filter.earlyEntries}
                onCheckedChange={checked =>
                  setFilter(f => ({ ...f, earlyEntries: checked === true }))
                }
              />
              <span>Early Entries</span>
            </label>
            <label htmlFor="armband-day" className={TAP_ROW}>
              <Checkbox
                id="armband-day"
                checked={filter.dayOfShowEntries}
                onCheckedChange={checked =>
                  setFilter(f => ({
                    ...f,
                    dayOfShowEntries: checked === true,
                  }))
                }
              />
              <span>Day of Show Entries</span>
            </label>
            {/* The number input is a SIBLING of the checkbox's label — never
                nested inside it — so tapping the field cannot toggle the
                checkbox. */}
            <div className="flex items-center gap-2 min-h-[44px]">
              <label
                htmlFor="armband-specific"
                className="flex items-center gap-2 text-sm cursor-pointer min-h-[44px]"
              >
                <Checkbox
                  id="armband-specific"
                  checked={showSpecific}
                  onCheckedChange={checked => {
                    const next = checked === true;
                    setShowSpecific(next);
                    if (!next) setSpecificArmband('');
                  }}
                />
                <span>Specific Armband Number</span>
              </label>
              {showSpecific && (
                <Input
                  type="number"
                  inputMode="numeric"
                  value={specificArmband}
                  onChange={e => setSpecificArmband(e.target.value)}
                  className="w-20 ml-2 h-11"
                  placeholder="#"
                  aria-label="Armband number"
                />
              )}
            </div>
          </div>
        </div>

        {/* Content Config */}
        <div>
          <SetupEyebrow className="mb-2">Include on Label</SetupEyebrow>
          <div className="grid grid-cols-2 gap-x-3">
            <label htmlFor="cfg-callName" className={TAP_ROW}>
              <Checkbox
                id="cfg-callName"
                checked={config.callName}
                onCheckedChange={checked => updateConfig('callName', checked === true)}
              />
              <span>Dog&apos;s Call Name</span>
            </label>
            <label htmlFor="cfg-trialDate" className={TAP_ROW}>
              <Checkbox
                id="cfg-trialDate"
                checked={config.trialDate}
                onCheckedChange={checked => updateConfig('trialDate', checked === true)}
              />
              <span>Trial Date</span>
            </label>
            <label htmlFor="cfg-handlerName" className={TAP_ROW}>
              <Checkbox
                id="cfg-handlerName"
                checked={config.handlerName}
                onCheckedChange={checked => updateConfig('handlerName', checked === true)}
              />
              <span>Handler&apos;s Name</span>
            </label>
            <label className={`${TAP_ROW} cursor-not-allowed text-muted-foreground`}>
              <Checkbox disabled />
              <span>Club Logo (coming soon)</span>
            </label>
            <label htmlFor="cfg-showAccessCode" className={TAP_ROW}>
              <Checkbox
                id="cfg-showAccessCode"
                checked={config.showAccessCode}
                onCheckedChange={checked => updateConfig('showAccessCode', checked === true)}
              />
              <span>Show Access Code</span>
            </label>
            <label
              htmlFor="cfg-venueWifi"
              className={`${TAP_ROW} ${!wifiAvailable ? 'cursor-not-allowed text-muted-foreground' : ''}`}
            >
              <Checkbox
                id="cfg-venueWifi"
                checked={config.venueWifi}
                onCheckedChange={checked => updateConfig('venueWifi', checked === true)}
                disabled={!wifiAvailable}
              />
              <span>Venue WiFi {!wifiAvailable && '(not configured)'}</span>
            </label>
          </div>
        </div>

        {/* Skip + Summary */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
          <label
            htmlFor="armband-skip"
            className="flex items-center gap-2 min-h-[44px] cursor-pointer"
          >
            <span>Labels to skip on first page:</span>
            <Input
              id="armband-skip"
              type="number"
              inputMode="numeric"
              min={0}
              max={template.labelsPerSheet - 1}
              value={skip}
              onChange={e =>
                setPrefs(p => ({
                  ...p,
                  skip: Math.max(0, Number(e.target.value)),
                }))
              }
              className="w-16 h-11"
            />
          </label>
          <span className="text-xs text-muted-foreground">
            {items.length} label{items.length !== 1 ? 's' : ''} on {pages.length} page
            {pages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Advanced — Printer Calibration */}
        <LabelCalibrationPanel
          prefs={prefs}
          setPrefs={setPrefs}
          template={template}
          iframeRef={externalIframeRef}
          onAfterTestPrint={writeLabelIframe}
        />
      </LabelSetupSection>

      {/* Empty state */}
      {items.length === 0 && !isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center p-8 text-muted-foreground"
        >
          {allEntries.length === 0
            ? 'No entries with armbands assigned for this show'
            : showSpecific && specificArmband
              ? `No entry found with armband #${specificArmband}`
              : 'No entries match the selected filters'}
        </div>
      )}

      {/* Live label preview */}
      {pages.map(page => (
        <div
          key={page.pageNumber}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidth}in)`,
            columnGap: `${template.gapX}in`,
            rowGap: `${template.gapY}in`,
            margin: '0 auto',
            marginBottom: '16px',
            border: '1px dashed var(--border)',
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
                  cell.type === 'item' ? '1px solid var(--border)' : '1px dashed var(--border)',
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
