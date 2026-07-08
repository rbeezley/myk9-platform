import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import type { ReportProps } from '@/lib/reports/types';
import type { OfficialPdfAction } from './ReportControlsBar';
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

interface UseAKCOfficialPdfActionInput {
  reportType: string;
  showId: string | undefined;
  showName: string | null | undefined;
  currentShowName: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
  hasShow: boolean;
  trialId: string;
  classId: string;
  dogId: string;
  officialPdfProps: ReportProps | null;
  officialClassPdfProps: ReportProps | null;
}

function isAKCRegistry(props: ReportProps | null | undefined): boolean {
  return props?.trial?.registryId?.trim().toUpperCase() === 'AKC';
}

export function useAKCOfficialPdfAction({
  reportType,
  showId,
  showName,
  currentShowName,
  isLoading,
  isError,
  hasShow,
  trialId,
  classId,
  dogId,
  officialPdfProps,
  officialClassPdfProps,
}: UseAKCOfficialPdfActionInput): OfficialPdfAction | undefined {
  const [isDownloadingOfficialPdf, setIsDownloadingOfficialPdf] = useState(false);
  const isAKCEntryFormReport = reportType === 'akc-scent-work-entry-form';
  const isAKCTransferFormReport = reportType === 'akc-scent-work-transfer-form';
  const isAKCScoreSheetReport = reportType === 'scoresheet';
  const isAKCCertificationPageReport = reportType === 'judges-certification';

  const entryFormData = useEntryFormData({
    showId: showId ?? '',
    trialId: trialId === 'all' ? undefined : trialId,
    dogId: dogId === 'all' ? undefined : dogId,
    enabled: isAKCEntryFormReport || isAKCTransferFormReport,
  });

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
        filename = buildAKCScentWorkEntryFormPacketFilename(showName ?? currentShowName);
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
    currentShowName,
    dogId,
    entryFormData.dogs,
    entryFormData.trials,
    officialEntryPdfDog,
    officialEntryPdfValues,
    showName,
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

  const selectedTrialAllowsAKCAction = trialId === 'all' || isAKCRegistry(officialPdfProps);
  const selectedClassAllowsAKCAction = classId === 'all' || isAKCRegistry(officialClassPdfProps);
  const officialPdfConfigIsAKC = officialPdfConfig?.templateId.startsWith('akc-') ?? false;
  const canShowScoreSheetAction =
    isAKCScoreSheetReport && selectedTrialAllowsAKCAction && selectedClassAllowsAKCAction;
  const canShowTransferFormAction =
    isAKCTransferFormReport && selectedTrialAllowsAKCAction && selectedClassAllowsAKCAction;

  if (officialPdfConfig && (!officialPdfConfigIsAKC || selectedTrialAllowsAKCAction)) {
    return {
      disabled: isLoading || isError || !hasShow || trialId === 'all',
      isLoading: isDownloadingOfficialPdf,
      label: trialId === 'all' ? 'Select trial for official PDF' : officialPdfConfig.actionLabel,
      missingFieldLabels: officialPdfMissingFieldLabels,
      onClick: handleOfficialPdfDownload,
    };
  }

  if (isAKCEntryFormReport && selectedTrialAllowsAKCAction) {
    return {
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
    };
  }

  if (canShowScoreSheetAction) {
    return {
      disabled:
        isLoading ||
        isError ||
        !hasShow ||
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
    };
  }

  if (canShowTransferFormAction) {
    return {
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
    };
  }

  if (isAKCCertificationPageReport && selectedTrialAllowsAKCAction) {
    return {
      disabled: isLoading || isError || !hasShow || trialId === 'all' || !officialPdfProps,
      isLoading: isDownloadingOfficialPdf,
      label:
        trialId === 'all' ? 'Select trial for official PDF' : 'Download AKC Certification Page PDF',
      missingFieldLabels: [],
      onClick: handleOfficialCertificationPdfDownload,
    };
  }

  return undefined;
}
