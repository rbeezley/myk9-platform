import type { ReportDefinition, ReportProps } from '@/lib/reports/types';
import { CheckInSheet } from '@/components/reports/CheckInSheet';
import { ScoresheetReport } from '@/components/reports/ScoresheetReport';
import { ResultsSheet } from '@/components/reports/ResultsSheet';
import { ShowFlyerReport } from '@/components/reports/ShowFlyerReport';
import { AKCScentWorkEntryForm } from '@/components/reports/AKCScentWorkEntryForm';
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

  // Phase 2 — stubs (disabled)
  {
    id: 'show-catalog',
    name: 'Show Catalog',
    category: 'operational',
    scopes: ['show', 'trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'result-catalog',
    name: 'Result Catalog',
    category: 'operational',
    scopes: ['show', 'trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'judges-schedule',
    name: "Judge's Schedule",
    category: 'operational',
    scopes: ['show'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'trial-secretary-report',
    name: 'Trial Secretary Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'judges-certification',
    name: "Judge's Certification Report",
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
  {
    id: 'trial-chairman-report',
    name: 'Trial Chairman Report',
    category: 'organization',
    scopes: ['trial'],
    sortOptions: [],
    defaultSort: '',
    component: PlaceholderReport,
    enabled: false,
  },
];

export function getReportById(id: string): ReportDefinition | undefined {
  return reportRegistry.find(r => r.id === id);
}

export function getEnabledReports(): ReportDefinition[] {
  return reportRegistry.filter(r => r.enabled);
}
