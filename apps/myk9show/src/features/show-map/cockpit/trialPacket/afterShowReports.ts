import type { RegistryId } from '@/features/registries';

/**
 * What the after-show packet holds for each registry (MYK9-1924 phase 2a), by the report's own
 * `registryId`, so an AKC trial is never offered a UKC form. `reports` print as pages (the marked
 * catalog, High in Trial); `forms` are the registry's own forms, delivered filled in as PDFs;
 * `kept` are the forms the club keeps with its show record, which Reports already builds per dog
 * and which the panel links to instead of rebuilding.
 *
 * Kept apart from the report registry so the Show Desk can name them without loading every report
 * component (the bundle budget). `afterShowReports.test.ts` checks each id against the registry,
 * and fails when a new registry-specific "after" report is added and not placed here.
 */
export interface AfterShowReportIds {
  reports: readonly string[];
  forms: readonly string[];
  kept: readonly KeptForm[];
}

/** A form the club keeps: named here so the Show Desk need not load the report registry. */
export interface KeptForm {
  id: string;
  name: string;
}

export const AFTER_SHOW_REPORTS: Readonly<Record<RegistryId, AfterShowReportIds>> = {
  AKC: {
    reports: ['result-catalog', 'high-in-trial', 'trial-secretary-certification'],
    forms: [
      'trial-secretary-report',
      'judges-certification',
      'trial-chairman-report',
      'akc-judge-report',
    ],
    kept: [
      { id: 'akc-scent-work-entry-form', name: 'AKC Scent Work Entry Form' },
      { id: 'akc-scent-work-transfer-form', name: 'AKC Scent Work Transfer Form' },
    ],
  },
  UKC: {
    reports: ['result-catalog'],
    forms: ['ukc-nosework-trial-report'],
    kept: [{ id: 'ukc-nosework-entry-form', name: 'UKC Nosework Entry Form' }],
  },
  ASCA: {
    // ASCA's High in Trial is optional (Program Rules 1.10): MYK9-1925's report belongs here.
    reports: ['result-catalog', 'asca-high-in-trial'],
    forms: [
      'asca-scent-detection-trial-report',
      'asca-scent-detection-gross-receipts',
      'asca-scent-detection-post-event-evaluation',
    ],
    kept: [{ id: 'asca-scent-detection-entry-form', name: 'ASCA Scent Detection Entry Form' }],
  },
};

/** "After" reports that are deliberately not part of the packet, with why. */
export const AFTER_SHOW_EXCLUDED: Readonly<Record<string, string>> = {
  'results-sheet': 'Prints one class at a time, on Results.',
};

/** The ids the packet holds for a registry, in print order. Unknown registries get the AKC set. */
export function afterShowReportsFor(registryId: string | null | undefined): AfterShowReportIds {
  const key = (registryId ?? '').trim().toUpperCase() as RegistryId;
  return AFTER_SHOW_REPORTS[key] ?? AFTER_SHOW_REPORTS.AKC;
}

/** The sentence the plan words for what the club must keep, for the registries that state it. */
export function clubKeepsNote(registryId: string | null | undefined): string | null {
  return (registryId ?? '').trim().toUpperCase() === 'AKC'
    ? 'The club keeps a marked catalog, the entry forms and the transfer forms for at least one year (AKC Chapter 3, Section 37).'
    : null;
}
