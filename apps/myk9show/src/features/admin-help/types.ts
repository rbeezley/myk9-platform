import type { UserRole } from '@/types/auth-types';

export type PageStatus = 'working' | 'stub' | 'known-issues';

export type PageClassification = 'critical-path' | 'park' | 'hidden';

export interface PageEntry {
  /** Must match a key in fullRouteRegistry (may contain :params) */
  path: string;
  /** Display title, e.g. "Show Entries" */
  title: string;
  /** 1-2 sentences, plain English */
  description: string;
  /** Who uses the page; drives role grouping */
  roles: UserRole[];
  /** Critical-path = keep, park = deprioritized, hidden = dev/internal */
  classification: PageClassification;
  /** Cross-role slice, free-form in v1 */
  category: string;
  /** Triage flag visible to admin */
  status: PageStatus;
}

export interface ExampleIds {
  showId?: string;
  trialId?: string;
  trialShowId?: string;
  classId?: string;
  classTrialId?: string;
  classShowId?: string;
  dogId?: string;
  clubId?: string;
  roleId?: string;
  templateId?: string;
  entryId?: string;
}
