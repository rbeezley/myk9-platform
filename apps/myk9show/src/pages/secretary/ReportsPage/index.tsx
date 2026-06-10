import { useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPreview } from './ReportPreview';
import { printIframe } from './reportPreviewUtils';
import { ArmbandLabelsReport } from '@/components/reports/labels/ArmbandLabelsReport';
import { buildTrialReportProps } from './reportDataMapping';
import { downloadPdfBytes } from '@/features/organization-forms/downloadPdf';
import {
  buildOfficialPdfFilename,
  getOfficialPdfMissingFieldLabels,
  getOfficialPdfReportConfig,
} from '@/features/organization-forms/officialPdfReports';

const DEFAULT_REPORT_ID = 'check-in-sheet';

export interface InitialReportScope {
  trialId: string;
  classId: string;
  dogId: string;
}

function nonEmptyParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

// Exported for unit testing — keeps the deep-link logic verifiable without
// asserting against shadcn SelectValue render internals.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialReportId(queryParam: string | null): string {
  if (!queryParam) return DEFAULT_REPORT_ID;
  const candidate = getReportById(queryParam);
  return candidate?.enabled ? queryParam : DEFAULT_REPORT_ID;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialReportScope(params: URLSearchParams): InitialReportScope {
  return {
    trialId: nonEmptyParam(params, 'trialId') ?? 'all',
    classId: nonEmptyParam(params, 'classId') ?? 'all',
    dogId: nonEmptyParam(params, 'dogId') ?? 'all',
  };
}

export default function ReportsPage() {
  const { showId } = useParams<{ showId: string }>();
  const { show: currentShow } = useFastShowDetails(showId);
  const [searchParams] = useSearchParams();
  const [initialScope] = useState(() => resolveInitialReportScope(searchParams));
  // Resolve once on mount so subsequent ?report= changes don't fight the
  // user's manual dropdown selection.
  const [reportType, setReportType] = useState(() =>
    resolveInitialReportId(searchParams.get('report'))
  );
  const [trialId, setTrialId] = useState<string>(initialScope.trialId);
  const [classId, setClassId] = useState<string>(initialScope.classId);
  const [dogId, setDogId] = useState<string>(initialScope.dogId);
  const report = getReportById(reportType);
  const [sortOrder, setSortOrder] = useState(report?.defaultSort ?? 'run-order');
  const [isDownloadingOfficialPdf, setIsDownloadingOfficialPdf] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { show, trials, classes, entries, isLoading, isError } = useReportData({
    show: currentShow,
    trialId,
    classId,
  });

  const trialOptions = useMemo(
    () =>
      ((trials ?? []) as Array<Record<string, unknown>>).map(t => ({
        id: t.id as string,
        name: (t.name ?? '') as string,
        trial_number: Number(t.trial_number ?? 0),
        date: (t.date ?? '') as string,
      })),
    [trials]
  );

  const classOptions = useMemo(
    () =>
      ((classes ?? []) as Array<Record<string, unknown>>).map(c => ({
        id: c.id as string,
        name: (c.name ?? '') as string,
        element: (c.element ?? '') as string,
        level: (c.level ?? '') as string,
        section: (c.section ?? '') as string,
        trial_id: (c.trial_id ?? '') as string,
      })),
    [classes]
  );

  const { data: dogOptionsRaw } = useQuery({
    queryKey: ['entry-form-dog-options', showId],
    queryFn: async () => {
      if (!showId) return [];
      const { data: entryDogs } = await supabase
        .from('entries')
        .select('dog_id, armband, dog:dogs!inner(id, call_name)')
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!entryDogs?.length) return [];

      const dogIds = [...new Set(entryDogs.map(e => e.dog_id).filter(Boolean))] as string[];
      const { data: regs } = await supabase
        .from('dog_registrations')
        .select('dog_id, registered_name')
        .in('dog_id', dogIds);

      const regMap = new Map((regs ?? []).map(r => [r.dog_id, r.registered_name]));
      const seen = new Set<string>();

      return entryDogs
        .filter(e => {
          if (!e.dog_id || seen.has(e.dog_id)) return false;
          seen.add(e.dog_id);
          return true;
        })
        .map(e => ({
          id: e.dog_id!,
          callName: ((e.dog as Record<string, unknown>)?.call_name as string) ?? '',
          registeredName: regMap.get(e.dog_id!) ?? null,
          armband: e.armband != null ? Number(e.armband) : null,
        }))
        .sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
    },
    enabled: !!showId && (report?.supportsDogFilter ?? false),
    staleTime: 5 * 60 * 1000,
  });

  const dogOptions = dogOptionsRaw ?? [];

  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const newReport = getReportById(value);
    setSortOrder(newReport?.defaultSort ?? 'run-order');
    setTrialId('all');
    setClassId('all');
    setDogId('all');
  };

  const handleTrialChange = (value: string) => {
    setTrialId(value);
    setDogId('all');
    setClassId('all');
  };

  const handlePrint = () => {
    printIframe(iframeRef);
  };

  const officialPdfProps = useMemo(() => {
    if (!show || trialId === 'all') return null;
    return (
      buildTrialReportProps({
        show,
        trials: trials as Parameters<typeof buildTrialReportProps>[0]['trials'],
        classes: classes as Parameters<typeof buildTrialReportProps>[0]['classes'],
        entries: entries as Parameters<typeof buildTrialReportProps>[0]['entries'],
        trialId,
        sortOrder,
      })[0] ?? null
    );
  }, [show, trials, classes, entries, trialId, sortOrder]);

  const officialPdfConfig = useMemo(
    () => getOfficialPdfReportConfig(reportType, officialPdfProps),
    [officialPdfProps, reportType]
  );

  const officialPdfMissingFieldLabels = useMemo(() => {
    if (!officialPdfProps) return [];
    return getOfficialPdfMissingFieldLabels(reportType, officialPdfProps);
  }, [officialPdfProps, reportType]);

  const handleOfficialPdfDownload = useCallback(async () => {
    if (!officialPdfProps) {
      toast.error('Select a trial before downloading the official PDF');
      return;
    }
    if (!officialPdfConfig) return;

    setIsDownloadingOfficialPdf(true);
    try {
      const { buildOfficialPdfBytes } =
        await import('@/features/organization-forms/officialPdfDownload');
      const bytes = await buildOfficialPdfBytes(officialPdfConfig, officialPdfProps);
      downloadPdfBytes(bytes, buildOfficialPdfFilename(officialPdfConfig, officialPdfProps));
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [officialPdfConfig, officialPdfProps]);

  const officialPdfAction = officialPdfConfig
    ? {
        disabled: isLoading || isError || !show || trialId === 'all',
        isLoading: isDownloadingOfficialPdf,
        label: trialId === 'all' ? 'Select trial for official PDF' : officialPdfConfig.actionLabel,
        missingFieldLabels: officialPdfMissingFieldLabels,
        onClick: handleOfficialPdfDownload,
      }
    : undefined;

  return (
    <div className="container mx-auto py-6 flex flex-col">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
      </div>

      {/* Controls */}
      <ReportControlsBar
        reportType={reportType}
        trialId={trialId}
        classId={classId}
        dogId={dogId}
        sortOrder={sortOrder}
        trials={trialOptions}
        classes={classOptions}
        dogs={dogOptions}
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onDogChange={setDogId}
        onSortChange={setSortOrder}
        onPrint={handlePrint}
        officialPdfAction={officialPdfAction}
      />

      {/* Preview */}
      <div className="mt-6 flex justify-center">
        {reportType === 'armband-labels' ? (
          <div className="w-full">
            <ArmbandLabelsReport showId={showId} iframeRef={iframeRef} />
            <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
          </div>
        ) : (
          <ReportPreview
            reportType={reportType}
            show={show}
            trials={trials as Parameters<typeof ReportPreview>[0]['trials']}
            classes={classes as Parameters<typeof ReportPreview>[0]['classes']}
            entries={entries as Parameters<typeof ReportPreview>[0]['entries']}
            trialId={trialId}
            classId={classId}
            dogId={dogId}
            sortOrder={sortOrder}
            isLoading={isLoading}
            isError={isError}
            iframeRef={iframeRef}
          />
        )}
      </div>
    </div>
  );
}
