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
import {
  getOrganizationFormTemplate,
  getOrganizationFormTemplateUrl,
} from '@/features/organization-forms/organizationFormTemplates';
import { AKC_SCENT_WORK_ENTRY_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/akcScentWorkEntryFormFields';
import { AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/akcScentWorkTransferFormFields';
import { findMissingPdfRequiredFieldLabels } from '@/features/organization-forms/pdfFormCompleteness';
import {
  buildOfficialPdfFilename,
  getOfficialPdfMissingFieldLabels,
  getOfficialPdfReportConfig,
} from '@/features/organization-forms/officialPdfReports';
import {
  buildUKCNoseworkChangeEntryFormFilename,
  buildUKCNoseworkChangeEntryFormValues,
} from '@/features/organization-forms/ukcNoseworkChangeEntryForm';
import { UKC_NOSEWORK_CHANGE_ENTRY_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/ukcNoseworkChangeEntryFormFields';
import {
  buildUKCNoseworkEntryFormFilename,
  buildUKCNoseworkEntryFormPacketFilename,
  buildUKCNoseworkEntryFormPacketPdfBytes,
  buildUKCNoseworkEntryFormValues,
} from '@/features/organization-forms/ukcNoseworkEntryForm';
import { UKC_NOSEWORK_ENTRY_FORM_REQUIRED_FIELDS } from '@/features/organization-forms/ukcNoseworkEntryFormFields';

interface UseAKCOfficialPdfActionInput {
  reportType: string;
  showId: string | undefined;
  showName: string | null | undefined;
  currentShowName: string | null | undefined;
  /**
   * True only when the trials/classes/entries backing this PDF are all present
   * and current. Replaces the old `isLoading || isError` pair, which left two
   * states uncovered -- a PAUSED query (offline: not loading, not erroring, no
   * data) and PLACEHOLDER data from the previously selected trial. Both used to
   * produce a downloadable registry PDF built from the wrong roster, announced
   * with a success toast.
   */
  isDataReady: boolean;
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

function isUKCRegistry(props: ReportProps | null | undefined): boolean {
  return props?.trial?.registryId?.trim().toUpperCase() === 'UKC';
}

/**
 * Why a disabled control no longer speaks in imperatives. "Select trial for
 * official PDF" is an instruction printed on a button that cannot be pressed,
 * so it reads as a broken control rather than an unmet precondition. The button
 * now always names the action it performs, and the requirement is said once,
 * underneath, in a sentence.
 */
const NEEDS_TRIAL = 'Pick a trial above to enable this.';
const NEEDS_CLASS = 'Pick a trial and a class above to enable this.';
const NEEDS_DOG_AND_CLASS = 'Pick a trial, a class, and a dog above to enable this.';

export function useAKCOfficialPdfAction({
  reportType,
  showId,
  showName,
  currentShowName,
  isDataReady,
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
  const isUKCEntryFormReport = reportType === 'ukc-nosework-entry-form';
  const isUKCChangeEntryFormReport = reportType === 'ukc-nosework-change-entry-form';

  const entryFormData = useEntryFormData({
    showId: showId ?? '',
    trialId: trialId === 'all' ? undefined : trialId,
    dogId: dogId === 'all' ? undefined : dogId,
    preferredRegistrationOrganization:
      isUKCEntryFormReport || isUKCChangeEntryFormReport ? 'UKC' : 'AKC',
    enabled:
      isAKCEntryFormReport ||
      isAKCTransferFormReport ||
      isUKCEntryFormReport ||
      isUKCChangeEntryFormReport,
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

  const officialUKCEntryPdfDog =
    isUKCEntryFormReport && dogId !== 'all' ? (entryFormData.dogs[0] ?? null) : null;
  const officialUKCEntryPdfValues = useMemo(() => {
    if (!officialUKCEntryPdfDog) return null;
    return buildUKCNoseworkEntryFormValues(officialUKCEntryPdfDog);
  }, [officialUKCEntryPdfDog]);
  const officialUKCEntryPdfMissingFieldLabels = useMemo(() => {
    if (!isUKCEntryFormReport) return [];

    const values =
      dogId === 'all'
        ? entryFormData.dogs.map(dog => buildUKCNoseworkEntryFormValues(dog))
        : officialUKCEntryPdfValues
          ? [officialUKCEntryPdfValues]
          : [];

    const labels = new Set<string>();
    for (const value of values) {
      for (const label of findMissingPdfRequiredFieldLabels(
        UKC_NOSEWORK_ENTRY_FORM_REQUIRED_FIELDS,
        value
      )) {
        labels.add(label);
      }
    }

    return [...labels];
  }, [dogId, entryFormData.dogs, isUKCEntryFormReport, officialUKCEntryPdfValues]);

  const officialUKCChangeEntryPdfDog =
    isUKCChangeEntryFormReport && dogId !== 'all' ? (entryFormData.dogs[0] ?? null) : null;
  const officialUKCChangeEntryPdfEntry = useMemo(() => {
    if (!officialUKCChangeEntryPdfDog || classId === 'all') return null;
    return officialUKCChangeEntryPdfDog.entries.find(entry => entry.classId === classId) ?? null;
  }, [classId, officialUKCChangeEntryPdfDog]);
  const officialUKCChangeEntryPdfValues = useMemo(() => {
    if (
      !officialUKCChangeEntryPdfDog ||
      !officialUKCChangeEntryPdfEntry ||
      !officialClassPdfProps
    ) {
      return null;
    }

    return buildUKCNoseworkChangeEntryFormValues({
      dog: officialUKCChangeEntryPdfDog,
      entry: officialUKCChangeEntryPdfEntry,
      props: officialClassPdfProps,
      secretary: entryFormData.secretary,
    });
  }, [
    entryFormData.secretary,
    officialClassPdfProps,
    officialUKCChangeEntryPdfDog,
    officialUKCChangeEntryPdfEntry,
  ]);
  const officialUKCChangeEntryPdfMissingFieldLabels = useMemo(() => {
    if (!isUKCChangeEntryFormReport || !officialUKCChangeEntryPdfValues) return [];
    return findMissingPdfRequiredFieldLabels(
      UKC_NOSEWORK_CHANGE_ENTRY_FORM_REQUIRED_FIELDS,
      officialUKCChangeEntryPdfValues
    );
  }, [isUKCChangeEntryFormReport, officialUKCChangeEntryPdfValues]);

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

  const handleOfficialUKCEntryPdfDownload = useCallback(async () => {
    if (dogId !== 'all' && (!officialUKCEntryPdfDog || !officialUKCEntryPdfValues)) {
      toast.error('The entry form data is still loading. Try again in a moment.');
      return;
    }
    if (dogId === 'all' && entryFormData.dogs.length === 0) {
      toast.error('No dogs are ready for an official UKC entry form packet yet.');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      let bytes: Uint8Array;
      let filename: string;

      if (dogId === 'all') {
        const response = await fetch(getOrganizationFormTemplateUrl('ukc-nosework-entry-form'));
        if (!response.ok) {
          throw new Error('Unable to load UKC Nosework entry form template.');
        }
        bytes = await buildUKCNoseworkEntryFormPacketPdfBytes({
          dogs: entryFormData.dogs,
          templateBytes: new Uint8Array(await response.arrayBuffer()),
        });
        filename = buildUKCNoseworkEntryFormPacketFilename(showName ?? currentShowName);
      } else {
        const { buildOfficialPdfBytesFromValues } =
          await import('@/features/organization-forms/officialPdfDownload');
        bytes = await buildOfficialPdfBytesFromValues(
          'ukc-nosework-entry-form',
          officialUKCEntryPdfValues!
        );
        filename = buildUKCNoseworkEntryFormFilename(officialUKCEntryPdfDog!);
      }

      downloadPdfBytes(bytes, filename);
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official UKC entry PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [
    currentShowName,
    dogId,
    entryFormData.dogs,
    officialUKCEntryPdfDog,
    officialUKCEntryPdfValues,
    showName,
  ]);

  const handleOfficialUKCChangeEntryPdfDownload = useCallback(async () => {
    if (trialId === 'all' || classId === 'all' || dogId === 'all') {
      toast.error('Select a trial, class, and dog before downloading the change entry PDF');
      return;
    }
    if (
      !officialUKCChangeEntryPdfDog ||
      !officialUKCChangeEntryPdfEntry ||
      !officialUKCChangeEntryPdfValues
    ) {
      toast.error('The selected dog is not entered in that class yet.');
      return;
    }

    setIsDownloadingOfficialPdf(true);
    try {
      const { buildOfficialPdfBytesFromValues } =
        await import('@/features/organization-forms/officialPdfDownload');
      const bytes = await buildOfficialPdfBytesFromValues(
        'ukc-nosework-change-entry-form',
        officialUKCChangeEntryPdfValues
      );
      downloadPdfBytes(
        bytes,
        buildUKCNoseworkChangeEntryFormFilename({
          dog: officialUKCChangeEntryPdfDog,
          entry: officialUKCChangeEntryPdfEntry,
        })
      );
      toast.success('Official PDF downloaded');
    } catch (error) {
      console.error('[reports] official UKC change entry PDF download failed', error);
      toast.error('Could not download the official PDF');
    } finally {
      setIsDownloadingOfficialPdf(false);
    }
  }, [
    classId,
    dogId,
    officialUKCChangeEntryPdfDog,
    officialUKCChangeEntryPdfEntry,
    officialUKCChangeEntryPdfValues,
    trialId,
  ]);

  const selectedTrialAllowsAKCAction = trialId === 'all' || isAKCRegistry(officialPdfProps);
  const selectedClassAllowsAKCAction = classId === 'all' || isAKCRegistry(officialClassPdfProps);
  const selectedTrialAllowsUKCAction = trialId === 'all' || isUKCRegistry(officialPdfProps);
  const selectedClassAllowsUKCAction = classId === 'all' || isUKCRegistry(officialClassPdfProps);
  const officialPdfConfigRegistry = officialPdfConfig
    ? getOrganizationFormTemplate(officialPdfConfig.templateId).registry
    : null;
  const selectedTrialAllowsOfficialPdfConfig =
    trialId === 'all' || officialPdfConfigRegistry == null
      ? true
      : officialPdfConfigRegistry === officialPdfProps?.trial?.registryId?.trim().toUpperCase();
  const canShowScoreSheetAction =
    isAKCScoreSheetReport && selectedTrialAllowsAKCAction && selectedClassAllowsAKCAction;
  const canShowTransferFormAction =
    isAKCTransferFormReport && selectedTrialAllowsAKCAction && selectedClassAllowsAKCAction;
  const canShowUKCEntryFormAction = isUKCEntryFormReport && selectedTrialAllowsUKCAction;
  const canShowUKCChangeEntryFormAction =
    isUKCChangeEntryFormReport && selectedTrialAllowsUKCAction && selectedClassAllowsUKCAction;

  if (officialPdfConfig && selectedTrialAllowsOfficialPdfConfig) {
    return {
      disabled: !isDataReady || !hasShow || trialId === 'all',
      isLoading: isDownloadingOfficialPdf,
      label: officialPdfConfig.actionLabel,
      disabledReason: trialId === 'all' ? NEEDS_TRIAL : undefined,
      missingFieldLabels: officialPdfMissingFieldLabels,
      onClick: handleOfficialPdfDownload,
    };
  }

  if (canShowUKCEntryFormAction) {
    return {
      disabled:
        !isDataReady ||
        entryFormData.isLoading ||
        entryFormData.isError ||
        (dogId === 'all' ? entryFormData.dogs.length === 0 : !officialUKCEntryPdfValues),
      isLoading: isDownloadingOfficialPdf,
      label: dogId === 'all' ? 'Download UKC Entry Form Packet' : 'Download UKC Entry Form PDF',
      missingFieldLabels: officialUKCEntryPdfMissingFieldLabels,
      onClick: handleOfficialUKCEntryPdfDownload,
    };
  }

  if (canShowUKCChangeEntryFormAction) {
    return {
      disabled:
        !isDataReady ||
        entryFormData.isLoading ||
        entryFormData.isError ||
        trialId === 'all' ||
        classId === 'all' ||
        dogId === 'all' ||
        !officialUKCChangeEntryPdfValues,
      isLoading: isDownloadingOfficialPdf,
      label: 'Download UKC Change Entry PDF',
      disabledReason:
        trialId === 'all' || classId === 'all' || dogId === 'all' ? NEEDS_DOG_AND_CLASS : undefined,
      missingFieldLabels: officialUKCChangeEntryPdfMissingFieldLabels,
      onClick: handleOfficialUKCChangeEntryPdfDownload,
    };
  }

  if (isAKCEntryFormReport && selectedTrialAllowsAKCAction) {
    return {
      disabled:
        !isDataReady ||
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
        !isDataReady ||
        !hasShow ||
        trialId === 'all' ||
        classId === 'all' ||
        !officialClassPdfProps,
      isLoading: isDownloadingOfficialPdf,
      label: 'Download AKC Score Sheet PDF',
      disabledReason: trialId === 'all' || classId === 'all' ? NEEDS_CLASS : undefined,
      missingFieldLabels: [],
      onClick: handleOfficialScoreSheetPdfDownload,
    };
  }

  if (canShowTransferFormAction) {
    return {
      disabled:
        !isDataReady ||
        entryFormData.isLoading ||
        entryFormData.isError ||
        trialId === 'all' ||
        classId === 'all' ||
        dogId === 'all' ||
        !officialTransferPdfValues,
      isLoading: isDownloadingOfficialPdf,
      label: 'Download AKC Transfer Form PDF',
      disabledReason:
        trialId === 'all' || classId === 'all' || dogId === 'all' ? NEEDS_DOG_AND_CLASS : undefined,
      missingFieldLabels: officialTransferPdfMissingFieldLabels,
      onClick: handleOfficialTransferPdfDownload,
    };
  }

  if (isAKCCertificationPageReport && selectedTrialAllowsAKCAction) {
    return {
      disabled: !isDataReady || !hasShow || trialId === 'all' || !officialPdfProps,
      isLoading: isDownloadingOfficialPdf,
      label: 'Download AKC Certification Page PDF',
      disabledReason: trialId === 'all' ? NEEDS_TRIAL : undefined,
      missingFieldLabels: [],
      onClick: handleOfficialCertificationPdfDownload,
    };
  }

  return undefined;
}
