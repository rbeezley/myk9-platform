import type { Entry } from '../../stores/entryStore';
import type { ClassInfo } from './hooks/useEntryListDataHelpers';
import type { PrintDialogType } from './CombinedEntryList.types';
import type { PrintSortOrder } from '../../components/dialogs/ScoresheetPrintDialog';
import {
  generateCheckInSheet,
  generateResultsSheet,
  generateScoresheetReport,
  type ReportClassInfo,
  type ScoresheetClassInfo,
  type ReportSortOrder,
} from '../../services/reportService';
import {
  parseOrganizationData,
  parseTimeLimit,
  fetchClassRequirements,
} from './CombinedEntryList.helpers';

/**
 * Build a ReportClassInfo object for the combined view
 */
function buildReportClassInfo(
  classInfo: ClassInfo,
  orgString: string,
  sectionLabel: string,
  judgeName?: string
): ReportClassInfo {
  const orgData = parseOrganizationData(orgString);
  return {
    className: `${classInfo.element} ${classInfo.level} ${sectionLabel}`,
    element: classInfo.element,
    level: classInfo.level,
    section: sectionLabel,
    trialDate: classInfo.trialDate || '',
    trialNumber: classInfo.trialNumber || '',
    judgeName: judgeName || classInfo.judgeName || 'TBD',
    organization: orgData.organization,
    activityType: orgData.activity_type,
  };
}

/**
 * Build a ScoresheetClassInfo object for the combined view
 */
async function buildScoresheetClassInfo(
  classInfo: ClassInfo,
  orgString: string,
  sectionLabel: string,
  judgeName?: string
): Promise<ScoresheetClassInfo> {
  const orgData = parseOrganizationData(orgString);
  const { hidesText, distractionsText } = await fetchClassRequirements(
    orgData,
    classInfo.element,
    classInfo.level
  );

  return {
    className: `${classInfo.element} ${classInfo.level} ${sectionLabel}`,
    element: classInfo.element,
    level: classInfo.level,
    section: sectionLabel,
    trialDate: classInfo.trialDate || '',
    trialNumber: classInfo.trialNumber || '',
    judgeName: judgeName || classInfo.judgeName || 'TBD',
    organization: orgData.organization,
    activityType: orgData.activity_type,
    timeLimitSeconds: parseTimeLimit(classInfo.timeLimit),
    timeLimitArea2Seconds: parseTimeLimit(classInfo.timeLimit2),
    timeLimitArea3Seconds: parseTimeLimit(classInfo.timeLimit3),
    areaCount: classInfo.areas,
    hidesText,
    distractionsText,
  };
}

export function handlePrintCheckIn(
  classInfo: ClassInfo | null,
  orgString: string,
  entries: Entry[],
  options?: { sortOrder?: ReportSortOrder }
): void {
  if (!classInfo) return;
  const reportClassInfo = buildReportClassInfo(classInfo, orgString, 'A & B');
  reportClassInfo.className = `${classInfo.element} ${classInfo.level} A & B Combined`;
  reportClassInfo.section = 'A & B';
  generateCheckInSheet(reportClassInfo, entries, options);
}

export function handlePrintResultsSection(
  classInfo: ClassInfo | null,
  orgString: string,
  entries: Entry[],
  section: 'A' | 'B',
  options?: { sortOrder?: 'placement' | 'armband' }
): void {
  if (!classInfo) return;
  const sectionEntries = entries.filter(entry => entry.section === section);
  const judgeName =
    section === 'B' ? classInfo.judgeNameB || classInfo.judgeName || 'TBD' : undefined;
  const reportClassInfo = buildReportClassInfo(
    classInfo,
    orgString,
    `Section ${section}`,
    judgeName
  );
  generateResultsSheet(reportClassInfo, sectionEntries, options);
}

export async function handlePrintScoresheetSection(
  classInfo: ClassInfo | null,
  orgString: string,
  entries: Entry[],
  section: 'A' | 'B',
  options?: { sortOrder?: ReportSortOrder; showSectionBadge?: boolean }
): Promise<void> {
  if (!classInfo) return;
  const sectionEntries = entries.filter(entry => entry.section === section);
  const judgeName =
    section === 'B' ? classInfo.judgeNameB || classInfo.judgeName || 'TBD' : undefined;
  const scoresheetClassInfo = await buildScoresheetClassInfo(
    classInfo,
    orgString,
    `Section ${section}`,
    judgeName
  );
  generateScoresheetReport(scoresheetClassInfo, sectionEntries, {
    ...options,
    showSectionBadge: true,
  });
}

/**
 * Dispatch a print action based on dialog type selection
 */
export function dispatchPrintAction(
  type: PrintDialogType,
  selectedSortOrder: PrintSortOrder,
  classInfo: ClassInfo | null,
  orgString: string,
  entries: Entry[]
): void {
  if (type === 'check-in') {
    handlePrintCheckIn(classInfo, orgString, entries, { sortOrder: selectedSortOrder });
  } else if (type === 'results-a') {
    handlePrintResultsSection(classInfo, orgString, entries, 'A', {
      sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
    });
  } else if (type === 'results-b') {
    handlePrintResultsSection(classInfo, orgString, entries, 'B', {
      sortOrder: selectedSortOrder === 'run-order' ? 'placement' : 'armband',
    });
  } else if (type === 'scoresheet-a') {
    handlePrintScoresheetSection(classInfo, orgString, entries, 'A', {
      sortOrder: selectedSortOrder,
    });
  } else if (type === 'scoresheet-b') {
    handlePrintScoresheetSection(classInfo, orgString, entries, 'B', {
      sortOrder: selectedSortOrder,
    });
  }
}
