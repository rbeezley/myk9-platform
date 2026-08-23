import type { ReportDefinition, ReportProps } from '@/lib/reports/types';
import { CheckInSheet } from '@/components/reports/CheckInSheet';
import { ScoresheetReport } from '@/components/reports/ScoresheetReport';
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
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: RUN_ORDER_SORT_OPTIONS,
    defaultSort: 'run-order',
    component: CheckInSheet,
    enabled: true,
  },
  {
    id: 'scoresheet',
    name: 'Score Sheet',
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: RUN_ORDER_SORT_OPTIONS,
    defaultSort: 'run-order',
    component: ScoresheetReport,
    enabled: true,
  },
  {
    id: 'results-sheet',
    name: 'Results Sheet',
    category: 'operational',
    scopes: ['trial', 'class'],
    sortOptions: PLACEMENT_SORT_OPTIONS,
    defaultSort: 'placement',
    component: ResultsSheet,
    enabled: true,
  },

  {
    id: 'show-flyer',
    name: 'Show Flyer',
    category: 'operational',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: ShowFlyerReport,
    enabled: true,
  },

  {
    id: 'akc-scent-work-entry-form',
    name: 'AKC Scent Work Entry Form',
    category: 'organization',
    scopes: ['show', 'trial'],
    sortOptions: [
      { value: 'armband', label: 'Armband Number' },
      { value: 'owner-name', label: 'Owner Last Name' },
      { value: 'dog-name', label: 'Dog Registered Name' },
    ],
    defaultSort: 'armband',
    component: AKCScentWorkEntryForm,
    enabled: true,
    supportsDogFilter: true,
  },
  {
    id: 'akc-scent-work-transfer-form',
    name: 'AKC Scent Work Transfer Form',
    category: 'organization',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: AKCScentWorkTransferFormPreview,
    enabled: true,
    supportsDogFilter: true,
  },
  {
    id: 'ukc-nosework-entry-form',
    name: 'UKC Nosework Entry Form',
    category: 'organization',
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
    supportsDogFilter: true,
  },
  {
    id: 'ukc-nosework-change-entry-form',
    name: 'UKC Nosework Change Entry Form',
    category: 'organization',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
    supportsDogFilter: true,
  },
  {
    id: 'ukc-nosework-judges-book-element',
    name: 'UKC Nosework Judges Book: Element Trial',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'ukc-nosework-judges-book-handler-discrimination',
    name: 'UKC Nosework Judges Book: Handler Discrimination',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'ukc-nosework-trial-score-sheet',
    name: 'UKC Nosework Trial Score Sheet',
    category: 'organization',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-entry-form',
    name: 'ASCA Scent Detection Entry Form',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-trial-report',
    name: 'ASCA Scent Detection Trial Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-trial-roster',
    name: 'ASCA Scent Detection Trial Roster',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-score-sheet',
    name: 'ASCA Scent Detection Score Sheet',
    category: 'organization',
    scopes: ['trial', 'class'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-gross-receipts',
    name: 'ASCA Scent Detection Gross Receipts Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },
  {
    id: 'asca-scent-detection-post-event-evaluation',
    name: 'ASCA Scent Detection Post-Event Evaluation',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    pdfOnly: true,
    enabled: true,
  },

  {
    id: 'armband-labels',
    name: 'Armband Labels',
    category: 'operational',
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
    category: 'operational',
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
    category: 'operational',
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
    category: 'operational',
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
    name: 'Trial Secretary Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialSecretaryReport,
    enabled: true,
  },
  {
    id: 'judges-certification',
    name: "Judge's Certification Report",
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: JudgesCertification,
    enabled: true,
  },
  {
    id: 'trial-chairman-report',
    name: 'Trial Chairman Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialChairmanReport,
    enabled: true,
  },
  {
    id: 'financial-report',
    name: 'Financial Report',
    category: 'financial',
    scopes: ['show'],
    sortOptions: [
      { value: 'current', label: 'Current Entries' },
      { value: 'waitlist', label: 'Waitlisted Entries' },
    ],
    defaultSort: 'current',
    component: FinancialReport,
    enabled: true,
  },
  // Phase 2 Extended Scope
  {
    id: 'show-entry-counts',
    name: 'Show Entry Counts',
    category: 'statistics',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: ShowEntryCounts,
    enabled: true,
  },
  {
    id: 'trial-entry-counts',
    name: 'Trial Entry Counts',
    category: 'statistics',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialEntryCounts,
    enabled: true,
  },
  {
    id: 'breed-entry-counts',
    name: 'Breed Entry Counts',
    category: 'statistics',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: BreedEntryCounts,
    enabled: true,
  },
  {
    id: 'judge-entry-counts',
    name: 'Judge Entry Counts',
    category: 'statistics',
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
    category: 'operational',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: WaitlistReport,
    enabled: true,
  },
  {
    id: 'steward-report',
    name: "Steward's Report",
    category: 'operational',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: StewardReport,
    enabled: true,
  },
  {
    id: 'result-labels',
    name: 'Result Labels',
    category: 'operational',
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
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: AKCJudgeReport,
    enabled: true,
  },
  {
    id: 'trial-secretary-certification',
    name: 'Trial Secretary Certification',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: TrialSecretaryCertification,
    enabled: true,
  },
  {
    id: 'judge-supply-checklist',
    name: 'Judge Supply Checklists',
    category: 'operational',
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
