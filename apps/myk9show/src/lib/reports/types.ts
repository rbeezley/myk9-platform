import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { EntryFormDog, EntryFormSecretary, EntryFormTrial } from './entryFormTypes';

import type { PacketArmband } from '@/features/emergency-trial-packet/armband';

import type React from 'react';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { PaymentStatus } from '@/types/show-registration-types';
import type { Show } from '@/types/show-types';
import type { DogRegistrationLike, MappedDogRegistrationLike } from '@/features/dogs/identity';
import type { RegistryId } from '@/features/registries';
import type { ProjectedEntryHandler } from '@/services/database/entries/entryHandlerProjection';

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
  withdrawalReason?: string;
  entryFee?: number;
  paymentStatus?: PaymentStatus | 'paid' | 'refunded';
  paymentMethod?: string;
  enrollmentPaymentStatus?: PaymentStatus | 'paid' | 'refunded';
  discountAmount?: number;
  refundAmount?: number;
  comped?: boolean;
  /**
   * MYK9-639: set on the DESTINATION of a move-up, pointing at the entry whose
   * money this run's dollars come from. Every money aggregation resolves it via
   * `@/features/financial/moneyRoot` so the pair is counted once, at the amount
   * actually paid.
   */
  movedFromEntryId?: string | null | undefined;
  entrySource?: ReportEntrySource;
  isDayOfShow?: boolean;
  // Class/trial context — populated for show-level and trial-level catalog reports
  classId?: string;
  classElement?: string;
  classLevel?: string;
  classSection?: string;
  trialId?: string;
  /** trials.name — the display label (MYK9-704). */
  trialName?: string;
  trialNumber?: string;
  trialDate?: string;
  judgeName?: string;
  /**
   * MYK9-570: true only when the handler's date of birth puts them inside this
   * trial's registry junior band on this trial's date. Absent for an adult, for
   * a handler with no date of birth, and for ASCA (whose rulebook states no
   * upper age bound) — the catalog prints a mark only when this is true.
   */
  handlerIsJunior?: boolean;
  /**
   * MYK9-1009 (AKC marked catalog). Every field below is absent when it was not
   * read or not recorded, and the catalog prints it blank: nothing is guessed.
   */
  /** The AKC registration's registered name; never the call name or `dogs.name`. */
  registeredName?: string | null;
  /** `dogs.date_of_birth`, an ISO `YYYY-MM-DD` date. */
  dateOfBirth?: string | null;
  /** The dog owner's full name. Not the handler: see `handlerDiffersFromOwner`. */
  ownerName?: string | null;
  /** The owner's mailing address as one printable line. */
  ownerAddress?: string | null;
  /**
   * True when the owner row WAS read and has no address parts. Distinct from an
   * unread owner (no flag), which the report-level notice covers instead.
   */
  ownerAddressMissing?: boolean;
  /**
   * True only when the entry names a handler who is not the owner. The catalog
   * prints a handler only then, as the AKC marked catalog requires.
   */
  handlerDiffersFromOwner?: boolean;
  /** `entries.withdrawal_reason_code`: `in_season` (AIS) or `judge_change` (AJC). */
  withdrawalReasonCode?: string | null;
  /** `entries.disqualification_reason`: the judge's note on an excused / DQ'd dog. */
  resultReason?: string | null;
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
    /** MYK9-1009: hydrated by `hydrateCatalogDogProfiles`; absent when that read failed. */
    date_of_birth?: string | null;
    registrations?: readonly (DogRegistrationLike | MappedDogRegistrationLike)[];
    owner?: {
      first_name?: string | null;
      last_name?: string | null;
      street_address?: string | null;
      city?: string | null;
      state?: string | null;
      zip_code?: string | null;
    } | null;
  } | null;
  /** Canonical assigned-handler-first identity attached by the entry read boundary. */
  handler_identity?: ProjectedEntryHandler;
  registration?: {
    payment_status?: string | null;
  } | null;
  /**
   * MYK9-570 / MYK9-664: the handler's name and the junior flag this entry
   * recorded at creation, hydrated by `loadEntryHandlerJuniorFlags`. Absent
   * when the hydration read did not run or did not complete — which is NOT the
   * same as "not a junior", so the mapper leaves the entry unmarked rather than
   * marking it an adult. The date of birth is never on this client.
   */
  handler_person?: {
    /**
     * The person's OWN name. Carried so the mapper can refuse to derive junior
     * status when `entries.handler_id` names someone other than the free-text
     * `entries.handler` the paperwork prints — see `handlerNameMatchesPerson`.
     */
    first_name?: string | null;
    last_name?: string | null;
    /** Recorded at entry: true = junior at this entry's trial, false = adult, null = unknown. */
    is_junior?: boolean | null;
  } | null;
};

export interface ReportSortOption {
  value: string;
  label: string;
}

/**
 * Data a report needs that can only come from an async fetch.
 *
 * MYK9-280: report components are rendered by `ReportPreview` through
 * `ReactDOMServer.renderToStaticMarkup`, which renders into a DETACHED tree
 * with no provider context. A component that calls a React Query hook there
 * throws `No QueryClient set` and the whole report is replaced by an error
 * boundary — in production the cause is minified away, so it reads as a broken
 * page rather than a broken contract. Two shipped reports were unreachable this
 * way for months.
 *
 * So the rule is: report components are PURE and props-driven. The host resolves
 * anything asynchronous (where the providers exist) and passes it in here.
 * `reportComponentsArePropsDriven.test.ts` fails the build if a registry
 * component reaches for a hook again.
 */
export interface ReportAsyncData<T> {
  data: T;
  isLoading: boolean;
  isError: boolean;
}

/**
 * One dog waiting in one class, read from `waitlist_entries` (MYK9-717).
 * Waitlisted dogs never appear in `entries` -- `entries_entry_status_check`
 * has no waitlist status -- so the Waitlist Report cannot be built from
 * `ReportProps.entries`.
 */
export interface ReportWaitlistRow {
  id: string;
  classId: string;
  position: number;
  callName: string;
  /** The named handler, else the dog's owner; null when neither is known. */
  handler: string | null;
}

export interface ReportEntryFormData {
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  show: {
    experienceIsPublished?: boolean;
    experiencePublishedContent?: ShowExperienceSnapshot | null;
  } | null;
  isLoading: boolean;
  isError: boolean;
}

/** A person the UKC Trial Report can print a contact block for (MYK9-828). */
export interface UKCTrialReportOfficial {
  name: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Show/club/officials data the UKC Trial Report needs beyond what `ReportProps`
 * otherwise carries — none of it is on the replicated `Show`/`DbTrial` shapes,
 * so it is fetched separately (`useUKCTrialReportContext`) and merged in.
 * Absent fields print blank rather than guessed (MYK9-828).
 */
export interface UKCTrialReportContext {
  venueCity: string | null;
  venueState: string | null;
  clubNumber: string | null;
  chairperson: UKCTrialReportOfficial | null;
  secretary: UKCTrialReportOfficial | null;
}

export interface ReportProps {
  showId?: string;
  showName: string;
  trial?: {
    date: string;
    /** trials.name — the display label (MYK9-704). */
    name?: string;
    trialNumber: string;
    judgeName: string;
    eventNumber?: string;
    registryId?: string;
    /**
     * `trials.actual_start_time` — a TEXT column holding an already-formatted
     * display string ("9:00 AM"), never an ISO timestamp; print it as-is.
     */
    actualStartTime?: string;
    /** `trials.actual_end_time` — same shape as `actualStartTime`. */
    actualEndTime?: string;
    /**
     * This trial's 1-based ordinal among trials sharing its calendar day in
     * this show, ordered by `trials.display_order`. Undefined when the day
     * has only one trial (MYK9-827).
     */
    dayTrialNumber?: number;
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
  /**
   * Async data resolved by the HOST, never fetched by the component itself.
   * See ReportAsyncData above — a hook here throws under renderToStaticMarkup.
   */
  entryFormData?: ReportEntryFormData;
  judgeSupplies?: ReportAsyncData<unknown[]>;
  waitlist?: ReportAsyncData<ReportWaitlistRow[]>;
  /** See `UKCTrialReportContext` — populated only for the UKC Trial Report. */
  ukcTrialReportContext?: UKCTrialReportContext | null;
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
    name?: string;
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
    /**
     * `classes.status` — one of upcoming / setup / in_progress / completed / cancelled.
     * High in Trial needs it because a CANCELLED class is not an "available class" under
     * Chapter 6 §10, and counting one as offered makes every team at that level
     * ineligible (nobody can qualify in a class that never ran), silently suppressing an
     * award the club should confer.
     */
    status?: string | null;
    judgeName?: string;
    stewards?: Record<string, string>;
    /** `classes.time_limit_seconds`: the maximum class time the AKC marked catalog prints. */
    timeLimitSeconds?: number | null;
  }>;
  includeEstimatedTime?: boolean;
  /**
   * MYK9-1009: false when the owner address / date of birth read for the AKC marked
   * catalog did not complete. Absent means complete. The catalog then prints a notice
   * at the top rather than leaving blank cells that read as "no data".
   */
  catalogProfilesReadComplete?: boolean;
}

/**
 * When in the life of a show a report is useful. The Reports dropdown groups by
 * this, so a secretary scans the phase she is in rather than an abstract
 * taxonomy. Nothing is GATED by it: every report stays listed and selectable in
 * every phase — the phase is a heading, not a permission.
 */
export type ReportPhase = 'before' | 'during' | 'after' | 'anytime';

export type ReportScope =
  | { kind: 'show'; showId: string }
  | { kind: 'trial'; showId: string; trialId: string }
  | { kind: 'class'; showId: string; trialId: string; classId: string };

export type ReportScopeKind = ReportScope['kind'];

export interface ReportDefinition {
  id: string;
  name: string;
  phase: ReportPhase;
  scopes: ReportScopeKind[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean;
  /**
   * Registry-specific forms are only useful for trials sanctioned by this
   * registry. Generic reports omit this field and remain available everywhere.
   */
  registryId?: RegistryId;
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
  /**
   * True for reports whose subject is the trial's CLASSES rather than its entries, so
   * they still have something to say when no dog is entered.
   *
   * `ReportPreview` otherwise short-circuits on a generic "No entries found for this
   * selection" before the component renders. For High in Trial that hid the one thing
   * the secretary needed — which levels were excluded and why — behind a message about
   * entries, for a report that is about whether §8 applies at all.
   */
  rendersWithoutEntries?: boolean;
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
