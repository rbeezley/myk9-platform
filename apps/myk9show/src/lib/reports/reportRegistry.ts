import type { ReportDefinition, ReportProps } from '@/lib/reports/types';
import { CheckInSheet } from '@/components/reports/CheckInSheet';
import { ScoresheetReport } from '@/components/reports/ScoresheetReport';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
import { ShowFlyerReport } from '@/components/reports/ShowFlyerReport';
import { AKCScentWorkEntryForm } from '@/components/reports/AKCScentWorkEntryForm';
import { ShowCatalog } from '@/components/reports/ShowCatalog';
import { ResultCatalog } from '@/components/reports/ResultCatalog';
import { JudgesSchedule } from '@/components/reports/JudgesSchedule';
import { TrialSecretaryReport } from '@/components/reports/TrialSecretaryReport';
import { JudgesCertification } from '@/components/reports/JudgesCertification';
import { TrialChairmanReport } from '@/components/reports/TrialChairmanReport';
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
    id: 'armband-labels',
    name: 'Armband Labels',
    category: 'operational',
    scopes: ['show'],
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
    scopes: ['show', 'trial'],
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
];

export function getReportById(id: string): ReportDefinition | undefined {
  return reportRegistry.find(r => r.id === id);
}

export function getEnabledReports(): ReportDefinition[] {
  return reportRegistry.filter(r => r.enabled);
}
