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
import { ResultLabelsReport } from '@/components/reports/labels/ResultLabelsReport';
import { LabelModeHeader } from '@/components/reports/labels/LabelModeChrome';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import { buildClassReportProps, buildTrialReportProps } from './reportDataMapping';
import { downloadPdfBytes } from '@/features/organization-forms/downloadPdf';
import {
  buildAKCScentWorkCertificationPageFilename,
  buildAKCScentWorkCertificationPagePdfBytes,
} from '@/features/organization-forms/akcScentWorkCertificationPage';
import {
  buildAKCScentWorkEntryFormFilename,
  buildAKCScentWorkEntryFormPacketFilename,
  buildAKCScentWorkEntryFormPacketPdfBytes,
  buildAKCScentWorkEntryFormValues,
} from '@/features/organization-forms/akcScentWorkEntryForm';
import {
  buildAKCScentWorkScoreSheetFilename,
  buildAKCScentWorkScoreSheetPdfBytes,
} from '@/features/organization-forms/akcScentWorkScoreSheet';
import {
  buildAKCScentWorkTransferFormFilename,
  buildAKCScentWorkTransferFormValues,
} from '@/features/organization-forms/akcScentWorkTransferForm';
import { getOrganizationFormTemplateUrl } from '@/features/organization-forms/organizationFormTemplates';
import { AKC_SCENT_WORK_ENTRY_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/akcScentWorkEntryFormFields';
import { AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/akcScentWorkTransferFormFields';
import { findMissingPdfRequiredFieldLabels } from '@/features/organization-forms/pdfFormCompleteness';
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
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
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
  const isAKCEntryFormReport = reportType === 'akc-scent-work-entry-form';
  const isAKCTransferFormReport = reportType === 'akc-scent-work-transfer-form';
  const isAKCScoreSheetReport = reportType === 'scoresheet';
  const isAKCCertificationPageReport = reportType === 'judges-certification';

  const { show, trials, classes, entries, isLoading, isError, refetch } = useReportData({
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
  const entryFormData = useEntryFormData({
    showId: showId ?? '',
    trialId: trialId === 'all' ? undefined : trialId,
    dogId: dogId === 'all' ? undefined : dogId,
    enabled: isAKCEntryFormReport || isAKCTransferFormReport,
  });

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
    if (!printIframe(iframeRef)) {
      toast.error('The report is still loading. Wait for the preview, then print.');
    }
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

  const officialClassPdfProps = useMemo(() => {
    if (!show || trialId === 'all' || classId === 'all') return null;
    return buildClassReportProps({
      show,
      trials: trials as Parameters<typeof buildClassReportProps>[0]['trials'],
      classes: classes as Parameters<typeof buildClassReportProps>[0]['classes'],
      entries: entries as Parameters<typeof buildClassReportProps>[0]['entries'],
      trialId,
      classId,
      sortOrder,
    });
  }, [show, trials, classes, entries, trialId, classId, sortOrder]);

  const officialPdfConfig = useMemo(
    () => getOfficialPdfReportConfig(reportType, officialPdfProps),
    [officialPdfProps, reportType]
  );

  const officialPdfMissingFieldLabels = useMemo(() => {
    if (!officialPdfProps) return [];
    return getOfficialPdfMissingFieldLabels(reportType, officialPdfProps);
  }, [officialPdfProps, reportType]);

  const officialEntryPdfDog =
    isAKCEntryFormReport && dogId !== 'all' ? (entryFormData.dogs[0] ?? null) : null;
  const officialEntryPdfValues = useMemo(() => {
    if (!officialEntryPdfDog) return null;
    return buildAKCScentWorkEntryFormValues({
      dog: officialEntryPdfDog,
      trials: entryFormData.trials,
    });
  }, [entryFormData.trials, officialEntryPdfDog]);

  const officialEntryPdfMissingFieldLabels = useMemo(() => {
    if (!isAKCEntryFormReport) return [];

    const values =
      dogId === 'all'
        ? entryFormData.dogs.map(dog =>
            buildAKCScentWorkEntryFormValues({
              dog,
              trials: entryFormData.trials,
            })
          )
        : officialEntryPdfValues
          ? [officialEntryPdfValues]
          : [];

    const labels = new Set<string>();
    for (const value of values) {
      for (const label of findMissingPdfRequiredFieldLabels(
        AKC_SCENT_WORK_ENTRY_FORM_REQUIRED_FIELDS,
        value
      )) {
        labels.add(label);
      }
    }

    return [...labels];
  }, [
    dogId,
    entryFormData.dogs,
    entryFormData.trials,
    isAKCEntryFormReport,
    officialEntryPdfValues,
  ]);

  const officialTransferPdfDog =
    isAKCTransferFormReport && dogId !== 'all' ? (entryFormData.dogs[0] ?? null) : null;
  const officialTransferPdfEntry = useMemo(() => {
    if (!officialTransferPdfDog || classId === 'all') return null;
    return officialTransferPdfDog.entries.find(entry => entry.classId === classId) ?? null;
  }, [classId, officialTransferPdfDog]);
  const officialTransferPdfValues = useMemo(() => {
    if (!officialTransferPdfDog || !officialTransferPdfEntry || !officialClassPdfProps) {
      return null;
    }

    return buildAKCScentWorkTransferFormValues({
      dog: officialTransferPdfDog,
      entry: officialTransferPdfEntry,
      props: officialClassPdfProps,
      secretary: entryFormData.secretary,
    });
  }, [
    entryFormData.secretary,
    officialClassPdfProps,
    officialTransferPdfDog,
    officialTransferPdfEntry,
  ]);
  const officialTransferPdfMissingFieldLabels = useMemo(() => {
    if (!isAKCTransferFormReport || !officialTransferPdfValues) return [];
    return findMissingPdfRequiredFieldLabels(
      AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS,
      officialTransferPdfValues
    );
  }, [isAKCTransferFormReport, officialTransferPdfValues]);

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

  const handleOfficialEntryPdfDownload = useCallback(async () => {
    if (dogId !== 'all' && (!officialEntryPdfDog || !officialEntryPdfValues)) {
      toast.error('The entry form data is still loading. Try again in a moment.');
      return;
    }
    if (dogId === 'all' && entryFormData.dogs.length === 0) {
      toast.error('No dogs are ready for an official entry form packet yet.');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      let bytes: Uint8Array;
      let filename: string;

      if (dogId === 'all') {
        const response = await fetch(getOrganizationFormTemplateUrl('akc-scent-work-entry-form'));
        if (!response.ok) {
          throw new Error('Unable to load AKC Scent Work entry form template.');
        }
        bytes = await buildAKCScentWorkEntryFormPacketPdfBytes({
          dogs: entryFormData.dogs,
          trials: entryFormData.trials,
          templateBytes: new Uint8Array(await response.arrayBuffer()),
        });
        filename = buildAKCScentWorkEntryFormPacketFilename(show?.name ?? currentShow?.name);
      } else {
        const { buildOfficialPdfBytesFromValues } =
          await import('@/features/organization-forms/officialPdfDownload');
        bytes = await buildOfficialPdfBytesFromValues(
          'akc-scent-work-entry-form',
          officialEntryPdfValues!
        );
        filename = buildAKCScentWorkEntryFormFilename(officialEntryPdfDog!);
      }

      downloadPdfBytes(bytes, filename);
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official AKC entry PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [
    currentShow?.name,
    dogId,
    entryFormData.dogs,
    entryFormData.trials,
    officialEntryPdfDog,
    officialEntryPdfValues,
    show?.name,
  ]);

  const handleOfficialScoreSheetPdfDownload = useCallback(async () => {
    if (trialId === 'all' || classId === 'all') {
      toast.error('Select a trial and class before downloading the official score sheet PDF');
      return;
    }
    if (!officialClassPdfProps) {
      toast.error('The class data is still loading. Try again in a moment.');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      const response = await fetch(getOrganizationFormTemplateUrl('akc-scent-work-score-sheet'));
      if (!response.ok) {
        throw new Error('Unable to load AKC Scent Work score sheet template.');
      }

      const bytes = await buildAKCScentWorkScoreSheetPdfBytes({
        props: officialClassPdfProps,
        templateBytes: new Uint8Array(await response.arrayBuffer()),
      });
      downloadPdfBytes(bytes, buildAKCScentWorkScoreSheetFilename(officialClassPdfProps));
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official AKC score sheet PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [classId, officialClassPdfProps, trialId]);

  const handleOfficialTransferPdfDownload = useCallback(async () => {
    if (trialId === 'all' || classId === 'all' || dogId === 'all') {
      toast.error('Select a trial, class, and dog before downloading the transfer form PDF');
      return;
    }
    if (!officialTransferPdfDog || !officialTransferPdfEntry || !officialTransferPdfValues) {
      toast.error('The selected dog is not entered in that class yet.');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      const { buildOfficialPdfBytesFromValues } =
        await import('@/features/organization-forms/officialPdfDownload');
      const bytes = await buildOfficialPdfBytesFromValues(
        'akc-scent-work-transfer-form',
        officialTransferPdfValues
      );
      downloadPdfBytes(
        bytes,
        buildAKCScentWorkTransferFormFilename({
          dog: officialTransferPdfDog,
          entry: officialTransferPdfEntry,
        })
      );
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official AKC transfer PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [
    classId,
    dogId,
    officialTransferPdfDog,
    officialTransferPdfEntry,
    officialTransferPdfValues,
    trialId,
  ]);

  const handleOfficialCertificationPdfDownload = useCallback(async () => {
    if (!officialPdfProps) {
      toast.error('Select a trial before downloading the official certification PDF');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      const response = await fetch(
        getOrganizationFormTemplateUrl('akc-scent-work-certification-page')
      );
      if (!response.ok) {
        throw new Error('Unable to load AKC Scent Work certification page template.');
      }

      const bytes = await buildAKCScentWorkCertificationPagePdfBytes({
        props: officialPdfProps,
        templateBytes: new Uint8Array(await response.arrayBuffer()),
      });
      downloadPdfBytes(bytes, buildAKCScentWorkCertificationPageFilename(officialPdfProps));
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official AKC certification PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [officialPdfProps]);

  const officialPdfAction = officialPdfConfig
    ? {
        disabled: isLoading || isError || !show || trialId === 'all',
        isLoading: isDownloadingOfficialPdf,
        label: trialId === 'all' ? 'Select trial for official PDF' : officialPdfConfig.actionLabel,
        missingFieldLabels: officialPdfMissingFieldLabels,
        onClick: handleOfficialPdfDownload,
      }
    : isAKCEntryFormReport
      ? {
          disabled:
            isLoading ||
            isError ||
            entryFormData.isLoading ||
            entryFormData.isError ||
            (dogId === 'all' ? entryFormData.dogs.length === 0 : !officialEntryPdfValues),
          isLoading: isDownloadingOfficialPdf,
          label: dogId === 'all' ? 'Download AKC Entry Form Packet' : 'Download AKC Entry Form PDF',
          missingFieldLabels: officialEntryPdfMissingFieldLabels,
          onClick: handleOfficialEntryPdfDownload,
        }
      : isAKCScoreSheetReport
        ? {
            disabled:
              isLoading ||
              isError ||
              !show ||
              trialId === 'all' ||
              classId === 'all' ||
              !officialClassPdfProps,
            isLoading: isDownloadingOfficialPdf,
            label:
              trialId === 'all' || classId === 'all'
                ? 'Select class for official PDF'
                : 'Download AKC Score Sheet PDF',
            missingFieldLabels: [],
            onClick: handleOfficialScoreSheetPdfDownload,
          }
        : isAKCTransferFormReport
          ? {
              disabled:
                isLoading ||
                isError ||
                entryFormData.isLoading ||
                entryFormData.isError ||
                trialId === 'all' ||
                classId === 'all' ||
                dogId === 'all' ||
                !officialTransferPdfValues,
              isLoading: isDownloadingOfficialPdf,
              label:
                trialId === 'all' || classId === 'all' || dogId === 'all'
                  ? 'Select dog and class for official PDF'
                  : 'Download AKC Transfer Form PDF',
              missingFieldLabels: officialTransferPdfMissingFieldLabels,
              onClick: handleOfficialTransferPdfDownload,
            }
          : isAKCCertificationPageReport
            ? {
                disabled:
                  isLoading ||
                  isError ||
                  !show ||
                  trialId === 'all' ||
                  !officialPdfProps ||
                  officialPdfProps.trial?.registryId?.trim().toUpperCase() !== 'AKC',
                isLoading: isDownloadingOfficialPdf,
                label:
                  trialId === 'all'
                    ? 'Select trial for official PDF'
                    : 'Download AKC Certification Page PDF',
                missingFieldLabels: [],
                onClick: handleOfficialCertificationPdfDownload,
              }
            : undefined;

  return (
    <div className="container mx-auto py-6 flex flex-col">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Print check-in sheets, catalogs, official forms, and labels. Pick a report, narrow it to a
          trial or class, then print or download.
        </p>
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

      {/* Preview — the report iframe is a fixed 8.5in (letter) page. On viewports
          narrower than that (tablet/phone) it must scroll horizontally inside this
          container rather than overflow the page and clip the report's left edge.
          `w-fit mx-auto` centers it when there's room and keeps the left edge
          reachable when it overflows (unlike `flex justify-center`). */}
      <div className="mt-6 overflow-x-auto">
        {reportType === 'armband-labels' ? (
          <div className="w-full">
            <LabelModeHeader
              title="Print Labels — Armband"
              subtitle="Choose a label size, pick which armbands to print, then Print."
            />
            <ArmbandLabelsReport showId={showId} iframeRef={iframeRef} />
            <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
          </div>
        ) : reportType === 'result-labels' ? (
          <div className="w-full">
            <LabelModeHeader
              title="Print Labels — Results"
              subtitle="Pick a trial and class, set the sort, then Print the result labels."
            />
            <ResultLabelsReport
              show={show}
              trials={trials as Parameters<typeof ResultLabelsReport>[0]['trials']}
              classes={classes as Parameters<typeof ResultLabelsReport>[0]['classes']}
              entries={entries as Parameters<typeof ResultLabelsReport>[0]['entries']}
              trialId={trialId}
              classId={classId}
              sortOrder={sortOrder}
              isLoading={isLoading}
              iframeRef={iframeRef}
            />
            <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
          </div>
        ) : (
          <div className="w-fit mx-auto">
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
              onRetry={refetch}
              iframeRef={iframeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
