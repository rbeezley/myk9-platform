import type { PacketArmband } from '@/features/emergency-trial-packet/armband';

import type React from 'react';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { PaymentStatus } from '@/types/show-registration-types';
import type { Show } from '@/types/show-types';
import type {
  DogRegistrationLike,
  MappedDogRegistrationLike,
} from '@/features/dogs/identity';

export const REPORT_ENTRY_SOURCE = {
  MYK9: 'myk9',
  UKC_ONLINE: 'ukc_online',
} as const;

export type ReportEntrySource = (typeof REPORT_ENTRY_SOURCE)[keyof typeof REPORT_ENTRY_SOURCE];

export interface ReportEntry {
  id: string;
  dogId?: string;
  /**
   * The armband LABEL as issued ("104", "12A"), or null when the dog has none.
   * Both `entries.armband` and `armbands.armband_number` are `text`; a numeric
   * model had no way to hold a suffixed armband and coerced it to 0, which
   * printed as `#0` on paper. Order it with `compareArmbands`, never by
   * subtraction (MYK9-243).
   */
  armband: PacketArmband;
  runOrder: number | null;
  callName: string;
  breed: string;
  handler: string;
  registrationNumber: string | null;
  checkInStatus: string | null;
  section: string | null;
  isScored: boolean;
  resultText: string | null;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  // Financial fields — populated when DB has entry_fee/payment columns
  entryStatus?: string;
  entryFee?: number;
  paymentStatus?: PaymentStatus | 'paid' | 'refunded';
  paymentMethod?: string;
  enrollmentPaymentStatus?: PaymentStatus | 'paid' | 'refunded';
  discountAmount?: number;
  refundAmount?: number;
  comped?: boolean;
  entrySource?: ReportEntrySource;
  isDayOfShow?: boolean;
  // Class/trial context — populated for show-level and trial-level catalog reports
  classId?: string;
  classElement?: string;
  classLevel?: string;
  classSection?: string;
  trialId?: string;
  trialNumber?: string;
  trialDate?: string;
  judgeName?: string;
}

/**
 * Entry row after the Reports query hydrates the PostgREST/replication dog
 * relation with the registration rows needed for registry-specific paperwork.
 */
export type ReportDbEntry = DbEntry & {
  dog?: {
    id?: string;
    call_name?: string | null;
    breed?: string | null;
    registrations?: readonly (DogRegistrationLike | MappedDogRegistrationLike)[];
  } | null;
  registration?: {
    payment_status?: string | null;
  } | null;
};

export interface ReportSortOption {
  value: string;
  label: string;
}

export interface ReportProps {
  showId?: string;
  showName: string;
  trial?: {
    date: string;
    trialNumber: string;
    judgeName: string;
    eventNumber?: string;
    registryId?: string;
  };
  classData?: {
    element: string;
    level: string;
    section: string;
    timeLimitSeconds?: number | null;
    timeLimitArea2Seconds?: number | null;
    timeLimitArea3Seconds?: number | null;
    areaCount?: number | null;
    hidesText?: string | null;
    distractionsText?: string | null;
  };
  entries: ReportEntry[];
  sortOrder: string;
  organization?: string;
  activityType?: string;
  clubName?: string;
  showDates?: string;
  dogId?: string;
  trialId?: string;
  // For show-scoped reports: all trials and classes in the show
  allTrials?: Array<{
    id: string;
    date: string;
    trialNumber: string;
    registryId?: string;
    judgeName?: string;
  }>;
  allClasses?: Array<{
    id: string;
    trialId: string;
    element: string;
    level: string;
    section?: string | null;
    judgeName?: string;
    stewards?: Record<string, string>;
  }>;
  includeEstimatedTime?: boolean;
}

export type ReportCategory = 'operational' | 'organization' | 'statistics' | 'financial';

export type ReportScope =
  | { kind: 'show'; showId: string }
  | { kind: 'trial'; showId: string; trialId: string }
  | { kind: 'class'; showId: string; trialId: string; classId: string };

export type ReportScopeKind = ReportScope['kind'];

export interface ReportDefinition {
  id: string;
  name: string;
  category: ReportCategory;
  scopes: ReportScopeKind[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean;
  supportsDogFilter?: boolean;
  /**
   * Present on the two reports that must also render server-side (check-in
   * sheet, scoresheet). When set, ReportsPage renders this PDF instead of
   * `component`, so the paper is byte-identical to the trial packet's.
   */
  buildPdf?: (dataset: ReportDataSet, sortOrder: string) => Uint8Array;
  /**
   * True for registry forms that are delivered ONLY as a filled PDF -- their
   * `component` is the null-rendering placeholder on purpose, because the
   * registry's own AcroForm is the artifact and we fill it rather than
   * re-drawing it in HTML.
   *
   * This has to be declared rather than inferred. The placeholder component
   * renders nothing, `renderReportToHtml` still wraps that in a `<body>`, and
   * `printIframe` only tests whether the body has innerHTML -- so the preview
   * looked identical to "still loading" and Print produced blank paper, while
   * the real deliverable sat in a Download button the secretary had no reason
   * to connect to the empty page in front of her.
   */
  pdfOnly?: boolean;
}

export interface ReportDataSet {
  show: Show;
  pages: ReportPageData[];
}

export interface ReportPageData {
  trial: DbTrial;
  /**
   * Optional: a class-scoped report can be opened before class data resolves
   * (still loading, or the selected id no longer matches). Consumers must
   * skip such a page rather than dereference it.
   */
  classData?: DbClass;
  entries: ReportDbEntry[];
}
