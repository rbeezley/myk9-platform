import type { RegistryId } from '@/features/registries';
import type { ReportDefinition, ReportProps } from '@/lib/reports/types';
import { renderEmergencyTrialPacketPdf } from '@/features/emergency-trial-packet/renderPacketPdf';
import { toScoresheetModel, selectPacketPages } from '@/lib/reports/toScoresheetModel';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
import { ShowFlyerReport } from '@/components/reports/ShowFlyerReport';
import { AKCScentWorkEntryForm } from '@/components/reports/AKCScentWorkEntryForm';
import { AKCScentWorkTransferFormPreview } from '@/components/reports/AKCScentWorkTransferFormPreview';
import { ShowCatalog } from '@/components/reports/ShowCatalog';
import { ResultCatalog } from '@/components/reports/ResultCatalog';
import { JudgesSchedule } from '@/components/reports/JudgesSchedule';
import { TrialSecretaryReport } from '@/components/reports/TrialSecretaryReport';
import { JudgesCertification } from '@/components/reports/JudgesCertification';
import { TrialChairmanReport } from '@/components/reports/TrialChairmanReport';
import { FinancialReport } from '@/components/reports/FinancialReport';
import { ShowEntryCounts } from '@/components/reports/ShowEntryCounts';
import { TrialEntryCounts } from '@/components/reports/TrialEntryCounts';
import { BreedEntryCounts } from '@/components/reports/BreedEntryCounts';
import { JudgeEntryCounts } from '@/components/reports/JudgeEntryCounts';
import { WaitlistReport } from '@/components/reports/WaitlistReport';
import { StewardReport } from '@/components/reports/StewardReport';
import { AKCJudgeReport } from '@/components/reports/AKCJudgeReport';
import { TrialSecretaryCertification } from '@/components/reports/TrialSecretaryCertification';
import { JudgeSupplyChecklistReport } from '@/components/reports/JudgeSupplyChecklistReport';
import { HighInTrialReport } from '@/components/reports/HighInTrialReport';
import type React from 'react';

const PlaceholderReport: React.FC<ReportProps> = () => null;

const RUN_ORDER_SORT_OPTIONS = [
  { value: 'run-order', label: 'Run Order' },
  { value: 'armband', label: 'Armband #' },
];

const PLACEMENT_SORT_OPTIONS = [
  { value: 'placement', label: 'Placement' },
  { value: 'armband', label: 'Armband #' },
];

export const reportRegistry: ReportDefinition[] = [
  // Phase 1 — enabled
  {
    id: 'check-in-sheet',
    name: 'Check-in Sheet',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: RUN_ORDER_SORT_OPTIONS,
    defaultSort: 'run-order',
    // Rendered by `buildPdf` below (the shared trial-packet PDF renderer),
    // not this component — see ReportPreview.tsx's PDF branch. Kept as a
    // placeholder rather than deleted so `ReportDefinition.component` stays
    // non-optional. The old `CheckInSheet` React component and its test were
    // deleted in Task 7 (was dead code — unreferenced outside its own test).
    component: PlaceholderReport,
    enabled: true,
    buildPdf: (dataset, sortOrder) =>
      renderEmergencyTrialPacketPdf(
        selectPacketPages(toScoresheetModel(dataset, sortOrder), 'check-in')
      ),
  },
  {
    id: 'scoresheet',
    name: 'Score Sheet',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: RUN_ORDER_SORT_OPTIONS,
    defaultSort: 'run-order',
    // Rendered by `buildPdf` below — see the check-in-sheet comment above.
    // The old `ScoresheetReport` React component and its test were likewise
    // deleted in Task 7.
    component: PlaceholderReport,
    enabled: true,
    buildPdf: (dataset, sortOrder) =>
      renderEmergencyTrialPacketPdf(
        selectPacketPages(toScoresheetModel(dataset, sortOrder), 'score-recording')
      ),
  },
  {
    id: 'results-sheet',
    name: 'Results Sheet',
    phase: 'after',
    scopes: ['trial', 'class'],
    sortOptions: PLACEMENT_SORT_OPTIONS,
    defaultSort: 'placement',
    component: ResultsSheet,
    enabled: true,
  },

  {
    id: 'show-flyer',
    name: 'Show Flyer',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: ShowFlyerReport,
    enabled: true,
  },

  {
    id: 'akc-scent-work-entry-form',
    name: 'AKC Scent Work Entry Form',
    phase: 'before',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'armband', label: 'Armband Number' },
      { value: 'owner-name', label: 'Owner Last Name' },
      { value: 'dog-name', label: 'Dog Registered Name' },
    ],
    defaultSort: 'armband',
    component: AKCScentWorkEntryForm,
    enabled: true,
    registryId: 'AKC',
    supportsDogFilter: true,
  },
  {
    id: 'akc-scent-work-transfer-form',
    name: 'AKC Scent Work Transfer Form',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: AKCScentWorkTransferFormPreview,
    enabled: true,
    registryId: 'AKC',
    supportsDogFilter: true,
  },
  {
    id: 'high-in-trial',
    name: 'AKC High in Trial',
    phase: 'after',
    // Trial-scoped by rule, not by convenience: Chapter 6 §8 awards HIT per difficulty
    // level across the elements a TRIAL offers, so a class-scoped view cannot compute it.
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: HighInTrialReport,
    enabled: true,
    // The award is decided by which CLASSES ran, so this still explains itself for a
    // trial with no entries -- where the generic "No entries found" gate would hide it.
    rendersWithoutEntries: true,
    // AKC-specific: UKC and ASCA define their own high-scoring awards with different
    // eligibility, so offering this on their trials would state AKC's rules as theirs.
    registryId: 'AKC',
  },
  {
    id: 'ukc-nosework-entry-form',
    name: 'UKC Nosework Entry Form',
    phase: 'before',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'armband', label: 'Armband Number' },
      { value: 'owner-name', label: 'Owner Last Name' },
      { value: 'dog-name', label: 'Dog Registered Name' },
    ],
    defaultSort: 'armband',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
    supportsDogFilter: true,
  },
  {
    id: 'ukc-nosework-change-entry-form',
    name: 'UKC Nosework Change Entry Form',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
    supportsDogFilter: true,
  },
  {
    id: 'ukc-nosework-judges-book-element',
    name: 'UKC Nosework Judges Book: Element Trial',
    phase: 'during',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
  },
  {
    id: 'ukc-nosework-judges-book-handler-discrimination',
    name: 'UKC Nosework Judges Book: Handler Discrimination',
    phase: 'during',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
  },
  {
    id: 'ukc-nosework-trial-score-sheet',
    name: 'UKC Nosework Trial Score Sheet',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
  },
  {
    id: 'ukc-nosework-trial-report',
    name: 'UKC Nosework Trial Report',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'UKC',
  },
  {
    id: 'asca-scent-detection-entry-form',
    name: 'ASCA Scent Detection Entry Form',
    phase: 'before',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },
  {
    id: 'asca-scent-detection-trial-report',
    name: 'ASCA Scent Detection Trial Report',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },
  {
    id: 'asca-scent-detection-trial-roster',
    name: 'ASCA Scent Detection Trial Roster',
    phase: 'during',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },
  {
    id: 'asca-scent-detection-score-sheet',
    name: 'ASCA Scent Detection Score Sheet',
    phase: 'during',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },
  {
    id: 'asca-scent-detection-gross-receipts',
    name: 'ASCA Scent Detection Gross Receipts Report',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },
  {
    id: 'asca-scent-detection-post-event-evaluation',
    name: 'ASCA Scent Detection Post-Event Evaluation',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    registryId: 'ASCA',
  },

  {
    id: 'armband-labels',
    name: 'Armband Labels',
    phase: 'before',
    scopes: ['show', 'trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport, // Rendered directly by ReportsPage, not via ReportPreview
    enabled: true,
  },

  // Phase 2 — enabled
  {
    id: 'show-catalog',
    name: 'Show Catalog',
    phase: 'before',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'armband', label: 'Armband #' },
      { value: 'handler', label: 'Handler Name' },
      { value: 'breed', label: 'Breed' },
    ],
    defaultSort: 'armband',
    component: ShowCatalog,
    enabled: true,
  },
  {
    id: 'result-catalog',
    name: 'Result Catalog',
    phase: 'after',
    scopes: ['show', 'trial', 'class'],
    sortOptions: [
      { value: 'placement', label: 'Placement' },
      { value: 'armband', label: 'Armband #' },
      { value: 'handler', label: 'Handler Name' },
    ],
    defaultSort: 'placement',
    component: ResultCatalog,
    enabled: true,
  },
  {
    id: 'judges-schedule',
    name: "Judge's Schedule",
    phase: 'before',
    scopes: ['show'],
    sortOptions: [
      { value: 'trial-date', label: 'Trial Date' },
      { value: 'judge-name', label: 'Judge Name' },
    ],
    defaultSort: 'trial-date',
    component: JudgesSchedule,
    enabled: true,
  },
  {
    id: 'trial-secretary-report',
    name: 'AKC Trial Secretary Report',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialSecretaryReport,
    enabled: true,
    registryId: 'AKC',
  },
  {
    id: 'judges-certification',
    name: "AKC Judge's Certification Report",
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: JudgesCertification,
    enabled: true,
    registryId: 'AKC',
  },
  {
    id: 'trial-chairman-report',
    name: 'AKC Trial Chairman Report',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialChairmanReport,
    enabled: true,
    registryId: 'AKC',
  },
  {
    id: 'financial-report',
    name: 'Financial Report',
    phase: 'anytime',
    scopes: ['show'],
    // MYK9-718: the "Waitlisted Entries" variant is gone -- waitlisted dogs are
    // not entries and carry no money. The Waitlist Report lists them.
    sortOptions: [],
    defaultSort: '',
    component: FinancialReport,
    enabled: true,
  },
  // Phase 2 Extended Scope
  {
    id: 'show-entry-counts',
    name: 'Show Entry Counts',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: ShowEntryCounts,
    enabled: true,
  },
  {
    id: 'trial-entry-counts',
    name: 'Trial Entry Counts',
    phase: 'before',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialEntryCounts,
    enabled: true,
  },
  {
    id: 'breed-entry-counts',
    name: 'Breed Entry Counts',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: BreedEntryCounts,
    enabled: true,
  },
  {
    id: 'judge-entry-counts',
    name: 'Judge Entry Counts',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [
      { value: 'standard', label: 'Standard' },
      { value: 'with-time', label: 'Include Estimated Time' },
    ],
    defaultSort: 'standard',
    component: JudgeEntryCounts,
    enabled: true,
  },
  {
    id: 'waitlist-report',
    name: 'Waitlist Report',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: WaitlistReport,
    enabled: true,
    // Waitlisted dogs are in `waitlist_entries`, not `entries` (MYK9-717): a show
    // can have a waitlist and no confirmed entries yet.
    rendersWithoutEntries: true,
  },
  {
    id: 'steward-report',
    name: "Steward's Report",
    phase: 'during',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: StewardReport,
    enabled: true,
  },
  {
    id: 'result-labels',
    name: 'Result Labels',
    phase: 'after',
    scopes: ['trial', 'class'],
    sortOptions: [
      { value: 'placement', label: 'Placement' },
      { value: 'armband', label: 'Armband #' },
    ],
    defaultSort: 'placement',
    component: PlaceholderReport, // Rendered directly by ReportsPage, not via ReportPreview
    enabled: true,
  },
  {
    id: 'akc-judge-report',
    name: "AKC Judge's Report",
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: AKCJudgeReport,
    enabled: true,
    registryId: 'AKC',
  },
  {
    id: 'trial-secretary-certification',
    name: 'AKC Trial Secretary Certification',
    phase: 'after',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialSecretaryCertification,
    enabled: true,
    registryId: 'AKC',
  },
  {
    id: 'judge-supply-checklist',
    name: 'Judge Supply Checklists',
    phase: 'before',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: JudgeSupplyChecklistReport,
    enabled: true,
  },
];

export function getReportById(id: string): ReportDefinition | undefined {
  return reportRegistry.find(r => r.id === id);
}

export function getEnabledReports(): ReportDefinition[] {
  return reportRegistry.filter(r => r.enabled);
}

/**
 * Return the reports relevant to the registries represented by the current
 * report scope. Generic reports have no registryId and are always retained.
 * A selected report is retained even when its registry is outside the current
 * scope so a deep link never turns into an unreachable report after data loads.
 * An omitted registry list means the trial data is not ready, so keep the full
 * catalog visible rather than hiding a report on incomplete information.
 */
export function getReportsForRegistries(
  registryIds: readonly RegistryId[] | undefined,
  selectedReportId?: string
): ReportDefinition[] {
  // Keep disabled entries in the selector so the existing "Coming Soon"
  // affordance remains intact; registry scoping only changes which entries are
  // relevant, not whether the catalog explains future reports.
  const reports = reportRegistry;
  if (!registryIds?.length) return reports;

  return reports.filter(
    report =>
      report.registryId === undefined ||
      registryIds.includes(report.registryId) ||
      report.id === selectedReportId
  );
}
