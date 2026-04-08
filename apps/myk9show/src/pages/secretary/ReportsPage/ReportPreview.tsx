import React, { useRef, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { getReportById } from '@/lib/reports/reportRegistry';
import { mapDbEntryToReportEntry } from '@/lib/reports/reportUtils';
import type { ReportProps, ReportEntry } from '@/lib/reports/types';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { ReportDefinition } from '@/lib/reports/types';
import type { Show } from '@/types/show-types';

function isShowScoped(report: ReportDefinition): boolean {
  return report.scopes.length === 1 && report.scopes[0] === 'show';
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

function mapEntries(dbEntries: DbEntry[]): ReportEntry[] {
  return dbEntries.map(e => {
    const entry = e as Record<string, unknown>;
    const dog = entry.dog as Record<string, unknown> | null;
    const owner = dog?.owner as Record<string, unknown> | null;
    const handlerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '';
    const armbandNum = e.armband != null ? Number(e.armband) : null;
    return mapDbEntryToReportEntry(
      {
        id: e.id,
        armband: armbandNum,
        run_order: e.run_order,
        check_in_status: e.check_in_status,
        section: null, // not in entries table; classes carry section
        is_scored: e.is_scored,
        result_status: e.result_status,
        search_time_seconds: e.search_time_seconds,
        total_faults: e.total_faults,
        final_placement: e.final_placement,
      },
      (dog?.call_name as string) ?? `Dog ${e.armband ?? '?'}`,
      (dog?.breed as string) ?? '',
      handlerName,
      null // registration_number not in current join
    );
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

    const showScoped = isShowScoped(report);

    let combinedMarkup: string;

    if (showScoped) {
      // Show-scoped reports (e.g. Show Flyer) don't need trial/class pages
      const showDates =
        show.startDate && show.endDate && show.startDate !== show.endDate
          ? `${show.startDate} – ${show.endDate}`
          : (show.startDate ?? undefined);
      const props: ReportProps = {
        showId: show.id,
        showName: show.name ?? '',
        clubName: show.clubName ?? undefined,
        showDates,
        entries: [],
        sortOrder,
        organization: show.organization ?? undefined,
        dogId: dogId !== 'all' ? dogId : undefined,
        trialId: trialId !== 'all' ? trialId : undefined,
      };
      const ReportComponent = report.component;
      combinedMarkup = ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
    } else {
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
              judgeName: ((classData as Record<string, unknown>).judge_name as string) ?? 'TBD',
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
            entries: mapEntries(pageEntries),
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
  const showScoped = report ? isShowScoped(report) : false;

  const pages = showScoped ? [] : buildPages(trialId, classId, trials, classes, entries);
  const hasEntries = showScoped || pages.some(p => p.entries.length > 0);

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
