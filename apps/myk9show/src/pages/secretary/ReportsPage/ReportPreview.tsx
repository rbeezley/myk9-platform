import React, { useRef, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { getReportById } from '@/lib/reports/reportRegistry';
import { mapDbEntryToReportEntry } from '@/lib/reports/reportUtils';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { ReportDefinition } from '@/lib/reports/types';
import type { Show } from '@/types/show-types';

type RenderingMode = 'show' | 'trial' | 'class';

/**
 * Determines how the report should be rendered:
 * - 'show': one render call with all trials/classes/entries (Show Catalog, Result Catalog, Judge's Schedule)
 * - 'trial': one render call per trial with that trial's combined entries (Trial Secretary, Judge's Cert, Trial Chairman)
 * - 'class': existing behavior — one render call per class (Check-in Sheet, Scoresheet, Results Sheet)
 */
export function getReportRenderingMode(report: ReportDefinition): RenderingMode {
  if (report.scopes.includes('show')) return 'show';
  if (report.scopes.includes('trial') && !report.scopes.includes('class')) return 'trial';
  return 'class';
}

export interface ReportPreviewProps {
  reportType: string;
  show: Show | null | undefined;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  isLoading: boolean;
  isError: boolean;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

function mapEntries(dbEntries: DbEntry[], trial?: DbTrial, classData?: DbClass): ReportEntry[] {
  return dbEntries.map(e => {
    const entry = e as Record<string, unknown>;
    const dog = entry.dog as Record<string, unknown> | null;
    const owner = dog?.owner as Record<string, unknown> | null;
    const handlerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '';
    const armbandNum = e.armband != null ? Number(e.armband) : null;
    const base = mapDbEntryToReportEntry(
      {
        id: e.id,
        armband: armbandNum,
        run_order: e.run_order,
        check_in_status: e.check_in_status,
        section: null,
        is_scored: e.is_scored,
        result_status: e.result_status,
        search_time_seconds: e.search_time_seconds,
        total_faults: e.total_faults,
        final_placement: e.final_placement,
      },
      (dog?.call_name as string) ?? `Dog ${e.armband ?? '?'}`,
      (dog?.breed as string) ?? '',
      handlerName,
      null
    );
    return {
      ...base,
      ...(trial
        ? {
            trialId: trial.id,
            trialNumber: String(trial.trial_number ?? ''),
            trialDate: trial.date ?? '',
          }
        : {}),
      ...(classData
        ? {
            classId: classData.id,
            classElement: classData.element ?? '',
            classLevel: classData.level ?? '',
            classSection: classData.section ?? '',
            judgeName: ((classData as Record<string, unknown>).judge_name as string) ?? undefined,
          }
        : {}),
    };
  });
}

interface PageData {
  trial: DbTrial;
  classData: DbClass;
  entries: DbEntry[];
}

function buildPages(
  trialId: string,
  classId: string,
  trials: DbTrial[] | null | undefined,
  classes: DbClass[] | null | undefined,
  entries: DbEntry[] | null | undefined
): PageData[] {
  if (!trials || !classes || !entries) return [];

  const isAll = trialId === 'all' || classId === 'all';

  // Pre-index entries by class_id for O(1) lookups
  const entriesByClass = new Map<string, DbEntry[]>();
  for (const e of entries) {
    const key = e.class_id ?? '';
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key)!.push(e);
  }

  if (isAll) {
    const pages: PageData[] = [];
    for (const trial of trials) {
      const trialClasses = classes.filter(c => c.trial_id === trial.id);
      for (const classData of trialClasses) {
        const classEntries = entriesByClass.get(classData.id) ?? [];
        pages.push({ trial, classData, entries: classEntries });
      }
    }
    return pages;
  }

  const trial = trials.find(t => t.id === trialId);
  const classData = classes.find(c => c.id === classId);
  if (!trial || !classData) return [];

  const classEntries = entriesByClass.get(classId) ?? [];
  return [{ trial, classData, entries: classEntries }];
}

export function ReportPreview({
  reportType,
  show,
  trials,
  classes,
  entries,
  trialId,
  classId,
  dogId,
  sortOrder,
  isLoading,
  isError,
  iframeRef: externalIframeRef,
}: ReportPreviewProps) {
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (isLoading || isError || !show) return;

    const report = getReportById(reportType);
    if (!report) return;

    const renderingMode = getReportRenderingMode(report);

    let combinedMarkup: string;

    if (renderingMode === 'show') {
      // Filter to selected trial when a specific trial is chosen
      const targetTrialIds =
        trialId === 'all'
          ? (trials ?? []).map(t => t.id)
          : [trialId];

      const filteredClasses = (classes ?? []).filter(c =>
        targetTrialIds.includes(c.trial_id ?? '')
      );
      const filteredClassIds = new Set(filteredClasses.map(c => c.id));

      // Build enriched entries with class and trial metadata attached to each entry
      const allEntriesEnriched = (entries ?? [])
        .filter(e => filteredClassIds.has(e.class_id ?? ''))
        .map(e => {
          const cls = filteredClasses.find(c => c.id === e.class_id);
          const trial = (trials ?? []).find(t => t.id === cls?.trial_id);
          return mapEntries([e], trial, cls)[0];
        });

      const allTrials = (trials ?? [])
        .filter(t => targetTrialIds.includes(t.id))
        .map(t => ({
          id: t.id,
          date: t.date ?? '',
          trialNumber: String(t.trial_number ?? ''),
          judgeName:
            ((t as Record<string, unknown>).judge_name as string) ?? undefined,
        }));

      const allClasses = filteredClasses.map(c => ({
        id: c.id,
        trialId: c.trial_id ?? '',
        element: c.element ?? '',
        level: c.level ?? '',
        section: c.section ?? '',
        judgeName:
          ((c as Record<string, unknown>).judge_name as string) ?? undefined,
      }));

      const showDates =
        show.startDate && show.endDate && show.startDate !== show.endDate
          ? `${show.startDate} – ${show.endDate}`
          : (show.startDate ?? undefined);

      const props: ReportProps = {
        showId: show.id,
        showName: show.name ?? '',
        entries: allEntriesEnriched,
        sortOrder,
        allTrials,
        allClasses,
        organization: show.organization ?? undefined,
        clubName: show.clubName ?? undefined,
        showDates,
        ...(dogId !== 'all' ? { dogId } : {}),
        ...(trialId !== 'all' ? { trialId } : {}),
      };
      const ReportComponent = report.component;
      combinedMarkup = ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
    } else if (renderingMode === 'trial') {
      // One render call per trial — all that trial's entries combined
      const targetTrials =
        trialId === 'all'
          ? (trials ?? [])
          : (trials ?? []).filter(t => t.id === trialId);

      const allClasses = (classes ?? []).map(c => ({
        id: c.id,
        trialId: c.trial_id ?? '',
        element: c.element ?? '',
        level: c.level ?? '',
        section: c.section ?? '',
        judgeName:
          ((c as Record<string, unknown>).judge_name as string) ?? undefined,
      }));

      combinedMarkup = targetTrials
        .map(trial => {
          const trialClasses = (classes ?? []).filter(c => c.trial_id === trial.id);
          const trialEntries = (entries ?? []).filter(e =>
            trialClasses.some(c => c.id === e.class_id)
          );
          const enriched = trialEntries.map(e => {
            const cls = trialClasses.find(c => c.id === e.class_id);
            return mapEntries([e], trial, cls)[0];
          });
          const firstClassJudge =
            ((trialClasses[0] as Record<string, unknown> | undefined)
              ?.judge_name as string) ?? 'TBD';
          const props: ReportProps = {
            showId: show.id,
            showName: show.name ?? '',
            trial: {
              date: trial.date ?? '',
              trialNumber: String(trial.trial_number ?? ''),
              judgeName: firstClassJudge,
            },
            allClasses: allClasses.filter(c => c.trialId === trial.id),
            entries: enriched,
            sortOrder,
            organization: show.organization ?? undefined,
            clubName: show.clubName ?? undefined,
          };
          const ReportComponent = report.component;
          return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
        })
        .join('');
    } else {
      // Existing class-mode rendering (unchanged)
      const pages = buildPages(trialId, classId, trials, classes, entries);
      if (pages.length === 0) return;

      const ReportComponent = report.component;
      combinedMarkup = pages
        .map(({ trial, classData, entries: pageEntries }) => {
          const props: ReportProps = {
            showId: show.id,
            showName: show.name ?? '',
            trial: {
              date: trial.date ?? '',
              trialNumber: String(trial.trial_number ?? ''),
              judgeName:
                ((classData as Record<string, unknown>).judge_name as string) ?? 'TBD',
            },
            classData: {
              element: classData.element ?? '',
              level: classData.level ?? '',
              section: classData.section ?? '',
              timeLimitSeconds: classData.time_limit_seconds,
              areaCount: classData.num_areas,
              hidesText: classData.num_hides ? String(classData.num_hides) : null,
              distractionsText: classData.distraction_count
                ? String(classData.distraction_count)
                : null,
            },
            entries: mapEntries(pageEntries, trial, classData),
            sortOrder,
            organization: show.organization ?? undefined,
          };
          return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
        })
        .join('');
    }

    const html = renderReportToHtml(combinedMarkup);

    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();

    const timerId = setTimeout(() => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
      }
    }, 100);

    return () => clearTimeout(timerId);
  }, [
    reportType,
    show,
    trials,
    classes,
    entries,
    trialId,
    classId,
    dogId,
    sortOrder,
    isLoading,
    isError,
    iframeRef,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading report data...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        Failed to load report data. Please try again.
      </div>
    );
  }

  if (!show) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Select a show to generate reports
      </div>
    );
  }

  const report = getReportById(reportType);
  const renderingMode = report ? getReportRenderingMode(report) : 'class';

  // class-mode pages only — show-mode and trial-mode don't use buildPages
  const pages =
    renderingMode === 'class' ? buildPages(trialId, classId, trials, classes, entries) : [];

  const hasEntries =
    renderingMode === 'show'
      ? (() => {
          const targetIds = trialId === 'all' ? (trials ?? []).map(t => t.id) : [trialId];
          const classIds = new Set((classes ?? []).filter(c => targetIds.includes(c.trial_id ?? '')).map(c => c.id));
          return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
        })()
      : renderingMode === 'trial'
        ? (() => {
            const targetTrials = trialId === 'all' ? (trials ?? []) : (trials ?? []).filter(t => t.id === trialId);
            const classIds = new Set((classes ?? []).filter(c => targetTrials.some(t => t.id === c.trial_id)).map(c => c.id));
            return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
          })()
        : pages.some(p => p.entries.length > 0);

  if (!isLoading && !hasEntries) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No entries found for this selection
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Report Preview"
      className="bg-white shadow-lg"
      style={{ width: '8.5in', minHeight: '11in', border: 'none' }}
    />
  );
}
