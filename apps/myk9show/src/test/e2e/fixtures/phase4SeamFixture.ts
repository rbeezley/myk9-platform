/**
 * Phase 4 cross-role seam fixture model.
 *
 * Typed, in-memory model of ONE complete cross-role show used to exercise the
 * five Phase 4 seams (scratch/pull, waitlist promotion, entry question,
 * withdrawal/refund, results release) without mutating the shared Supabase
 * project. `createPhase4SeamState()` returns a fresh, deeply-cloned mutable
 * state per test so retries and later tests never inherit mutated data.
 *
 * The route interceptor in `phase4SeamRoutes.ts` owns all state transitions;
 * this file only defines the seed data and types. The data path inventory that
 * justifies each field/endpoint lives in `phase4SeamRoutes.ts` comments.
 *
 * IDs are prefixed `phase4-` and are intentionally readable. The interceptor
 * fulfils these requests locally before they reach Supabase, so the non-UUID
 * shape never reaches a real PostgREST column.
 */

export const PHASE4_IDS = {
  show: 'phase4-show-autumn-classic',
  trial: 'phase4-trial-day1',
  secretary: 'phase4-user-secretary',
  exhibitorA: 'phase4-user-exhibitor-a',
  exhibitorB: 'phase4-user-exhibitor-b',
  // people.id values (entries/waitlist FK an exhibitor person, not auth user)
  personA: 'phase4-person-exhibitor-a',
  personB: 'phase4-person-exhibitor-b',
  dogA: 'phase4-dog-scout',
  dogB: 'phase4-dog-ziva',
  classOpen: 'phase4-class-novice-a', // has open capacity (scratch/result/question)
  classFull: 'phase4-class-excellent-b', // at capacity (waitlist pressure)
  entryScratch: 'phase4-entry-scratch', // confirmed, eligible for pull/scratch request
  entryQuestion: 'phase4-entry-question', // confirmed, has a question thread
  entryWithdraw: 'phase4-entry-withdraw', // paid, to be refunded/withdrawn
  entryResult: 'phase4-entry-result', // scored, result hidden until release
  waitlist: 'phase4-waitlist-row', // waitlisted, capacity pressure
  enrollmentWithdraw: 'phase4-enrollment-withdraw', // payment/refund metadata
} as const;

/** Read-only app routes the cross-role spec visits. */
export const PHASE4_ROUTES = {
  exhibitorMyEntries: '/exhibitor/entries',
  exhibitorShowMessages: `/messages/${PHASE4_IDS.show}`,
  exhibitorResults: `/shows/${PHASE4_IDS.show}/results`,
  secretaryDashboard: '/secretary/dashboard',
  secretaryEntryManagement: `/secretary/shows/${PHASE4_IDS.show}/entries`,
  secretaryPullManagement: `/secretary/shows/${PHASE4_IDS.show}/entries?entryTab=scratches`,
  secretaryWaitlist: `/secretary/shows/${PHASE4_IDS.show}/waitlist`,
  secretaryMessages: `/secretary/messages?showId=${PHASE4_IDS.show}`,
  secretaryResultsControl: `/secretary/shows/${PHASE4_IDS.show}/results-control`,
} as const;

export type EntryStatus =
  | 'confirmed'
  | 'pending-payment'
  | 'scratch-requested'
  | 'scratched'
  | 'withdrawn'
  | 'pending';

export type CheckInStatus = 'not-checked-in' | 'checked-in' | 'pulled';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'partial-refund';

// Matches src/types/waitlist-types.ts. A pending row is 'waiting' (NOT
// 'waitlisted'); promotion keeps the row offered while payment is pending.
export type WaitlistStatus = 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';

export interface FixtureUser {
  id: string; // auth user id
  personId: string; // people.id
  email: string;
  name: string;
  role: 'secretary' | 'exhibitor';
}

export interface FixtureDog {
  id: string;
  name: string;
  call_name: string;
  owner_person_id: string;
}

export interface FixtureClass {
  id: string;
  trial_id: string;
  name: string;
  class_number: number;
  max_entries: number;
  entry_fee: number;
  /** ISO timestamp when results were released; null = hidden from exhibitors. */
  results_released_at: string | null;
  results_released_by: string | null;
}

export interface FixtureEntry {
  id: string;
  show_id: string;
  trial_id: string;
  class_id: string;
  dog_id: string;
  handler_id: string; // people.id
  exhibitor_user_id: string; // auth user id of the owning exhibitor
  enrollment_id: string | null;
  entry_status: EntryStatus;
  check_in_status: CheckInStatus;
  payment_status: PaymentStatus;
  entry_fee: number;
  handler: string;
  armband: number | null;
  special_requests: string | null;
  is_scored: boolean;
  final_placement: number | null;
  updated_at: string;
}

export interface FixtureEnrollment {
  id: string;
  payment_status: PaymentStatus;
  amount_paid: number;
  refund_amount: number;
  refund_status: 'none' | 'processed' | 'review';
  refunded_at: string | null;
}

export interface FixtureWaitlistEntry {
  id: string;
  show_id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string; // people.id
  handler_id: string; // people.id
  exhibitor_user_id: string; // auth user id
  status: WaitlistStatus;
  offered_at: string | null;
  offer_expires_at: string | null;
  /** Entry id created when the offer is promoted (waitlist -> pending-payment entry). */
  promoted_entry_id: string | null;
  updated_at: string;
}

export interface FixtureMessageThread {
  id: string;
  show_id: string;
  participant_id: string; // exhibitor auth user id
  last_message_at: string | null;
  created_at: string;
}

export interface FixtureMessage {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string; // auth user id
  body: string;
  group_label: string | null;
  read_at: string | null;
  created_at: string;
}

export interface FixtureShow {
  id: string;
  name: string;
  entry_close_at: string;
  /** Mapper-required columns for the shows replication sync (rowToShow). */
  organization: string;
  start_date: string;
  end_date: string;
  club_id: string;
}

export interface FixtureTrial {
  id: string;
  show_id: string;
  name: string;
  date: string;
}

export interface Phase4SeamState {
  show: FixtureShow;
  /** The single trial all fixture classes hang off (trials replication sync). */
  trial: FixtureTrial;
  users: { secretary: FixtureUser; exhibitorA: FixtureUser; exhibitorB: FixtureUser };
  dogs: Record<string, FixtureDog>;
  classes: Record<string, FixtureClass>;
  entries: Record<string, FixtureEntry>;
  enrollments: Record<string, FixtureEnrollment>;
  waitlistEntries: Record<string, FixtureWaitlistEntry>;
  threads: Record<string, FixtureMessageThread>;
  messages: FixtureMessage[];
  /** Monotonic counter so synthetic ids created during a walk are unique. */
  sequence: number;
}

const SEED_TS = '2026-06-01T12:00:00.000Z';
// Entry close in the past so the show models a post-deadline state (Task 2).
const ENTRY_CLOSE_TS = '2026-06-05T23:59:59.000Z';
// Show runs in the future so it models an upcoming (pre-results) state.
const SHOW_START_DATE = '2026-09-12';
const SHOW_END_DATE = '2026-09-13';
const PHASE4_CLUB_ID = 'phase4-club-autumn';

function seedState(): Phase4SeamState {
  const secretary: FixtureUser = {
    id: PHASE4_IDS.secretary,
    personId: 'phase4-person-secretary',
    email: 'secretary@myk9t.com',
    name: 'Sam Secretary',
    role: 'secretary',
  };
  const exhibitorA: FixtureUser = {
    id: PHASE4_IDS.exhibitorA,
    personId: PHASE4_IDS.personA,
    email: 'exhibitor1@myk9t.com',
    name: 'Alice Martin',
    role: 'exhibitor',
  };
  const exhibitorB: FixtureUser = {
    id: PHASE4_IDS.exhibitorB,
    personId: PHASE4_IDS.personB,
    email: 'exhibitor2@myk9t.com',
    name: 'Ben Walker',
    role: 'exhibitor',
  };

  return {
    show: {
      id: PHASE4_IDS.show,
      name: 'Autumn Classic Scent Work Trial',
      entry_close_at: ENTRY_CLOSE_TS,
      organization: 'AKC',
      start_date: SHOW_START_DATE,
      end_date: SHOW_END_DATE,
      club_id: PHASE4_CLUB_ID,
    },
    trial: {
      id: PHASE4_IDS.trial,
      show_id: PHASE4_IDS.show,
      name: 'Day 1 — Saturday',
      date: SHOW_START_DATE,
    },
    users: { secretary, exhibitorA, exhibitorB },
    dogs: {
      [PHASE4_IDS.dogA]: {
        id: PHASE4_IDS.dogA,
        name: 'Scout',
        call_name: 'Scout',
        owner_person_id: PHASE4_IDS.personA,
      },
      [PHASE4_IDS.dogB]: {
        id: PHASE4_IDS.dogB,
        name: 'Ziva',
        call_name: 'Ziva',
        owner_person_id: PHASE4_IDS.personB,
      },
    },
    classes: {
      [PHASE4_IDS.classOpen]: {
        id: PHASE4_IDS.classOpen,
        trial_id: PHASE4_IDS.trial,
        name: 'Novice A — Container',
        class_number: 101,
        max_entries: 10,
        entry_fee: 30,
        results_released_at: null,
        results_released_by: null,
      },
      [PHASE4_IDS.classFull]: {
        id: PHASE4_IDS.classFull,
        trial_id: PHASE4_IDS.trial,
        name: 'Excellent B — Interior',
        class_number: 201,
        max_entries: 1, // single seat -> waitlist pressure
        entry_fee: 30,
        results_released_at: null,
        results_released_by: null,
      },
    },
    entries: {
      [PHASE4_IDS.entryScratch]: {
        id: PHASE4_IDS.entryScratch,
        show_id: PHASE4_IDS.show,
        trial_id: PHASE4_IDS.trial,
        class_id: PHASE4_IDS.classOpen,
        dog_id: PHASE4_IDS.dogA,
        handler_id: PHASE4_IDS.personA,
        exhibitor_user_id: PHASE4_IDS.exhibitorA,
        enrollment_id: null,
        entry_status: 'confirmed',
        check_in_status: 'not-checked-in',
        payment_status: 'paid',
        entry_fee: 30,
        handler: 'Alice Martin',
        armband: 12,
        special_requests: null,
        is_scored: false,
        final_placement: null,
        updated_at: SEED_TS,
      },
      [PHASE4_IDS.entryQuestion]: {
        id: PHASE4_IDS.entryQuestion,
        show_id: PHASE4_IDS.show,
        trial_id: PHASE4_IDS.trial,
        class_id: PHASE4_IDS.classOpen,
        dog_id: PHASE4_IDS.dogA,
        handler_id: PHASE4_IDS.personA,
        exhibitor_user_id: PHASE4_IDS.exhibitorA,
        enrollment_id: null,
        entry_status: 'confirmed',
        check_in_status: 'not-checked-in',
        payment_status: 'paid',
        entry_fee: 30,
        handler: 'Alice Martin',
        armband: 13,
        special_requests: null,
        is_scored: false,
        final_placement: null,
        updated_at: SEED_TS,
      },
      // Single seat in classFull occupied by exhibitor B -> A waitlisted behind.
      'phase4-entry-fullseat': {
        id: 'phase4-entry-fullseat',
        show_id: PHASE4_IDS.show,
        trial_id: PHASE4_IDS.trial,
        class_id: PHASE4_IDS.classFull,
        dog_id: PHASE4_IDS.dogB,
        handler_id: PHASE4_IDS.personB,
        exhibitor_user_id: PHASE4_IDS.exhibitorB,
        enrollment_id: null,
        entry_status: 'confirmed',
        check_in_status: 'not-checked-in',
        payment_status: 'paid',
        entry_fee: 30,
        handler: 'Ben Walker',
        armband: 41,
        special_requests: null,
        is_scored: false,
        final_placement: null,
        updated_at: SEED_TS,
      },
      [PHASE4_IDS.entryWithdraw]: {
        id: PHASE4_IDS.entryWithdraw,
        show_id: PHASE4_IDS.show,
        trial_id: PHASE4_IDS.trial,
        class_id: PHASE4_IDS.classOpen,
        dog_id: PHASE4_IDS.dogB,
        handler_id: PHASE4_IDS.personB,
        exhibitor_user_id: PHASE4_IDS.exhibitorB,
        enrollment_id: PHASE4_IDS.enrollmentWithdraw,
        entry_status: 'confirmed',
        check_in_status: 'not-checked-in',
        payment_status: 'paid',
        entry_fee: 30,
        handler: 'Ben Walker',
        armband: 14,
        special_requests: null,
        is_scored: false,
        final_placement: null,
        updated_at: SEED_TS,
      },
      [PHASE4_IDS.entryResult]: {
        id: PHASE4_IDS.entryResult,
        show_id: PHASE4_IDS.show,
        trial_id: PHASE4_IDS.trial,
        class_id: PHASE4_IDS.classOpen,
        dog_id: PHASE4_IDS.dogA,
        handler_id: PHASE4_IDS.personA,
        exhibitor_user_id: PHASE4_IDS.exhibitorA,
        enrollment_id: null,
        entry_status: 'confirmed',
        check_in_status: 'checked-in',
        payment_status: 'paid',
        entry_fee: 30,
        handler: 'Alice Martin',
        armband: 15,
        special_requests: null,
        is_scored: true,
        final_placement: 1,
        updated_at: SEED_TS,
      },
    },
    enrollments: {
      [PHASE4_IDS.enrollmentWithdraw]: {
        id: PHASE4_IDS.enrollmentWithdraw,
        payment_status: 'paid',
        amount_paid: 30,
        refund_amount: 0,
        refund_status: 'none',
        refunded_at: null,
      },
    },
    waitlistEntries: {
      [PHASE4_IDS.waitlist]: {
        id: PHASE4_IDS.waitlist,
        show_id: PHASE4_IDS.show,
        class_id: PHASE4_IDS.classFull,
        dog_id: PHASE4_IDS.dogA,
        exhibitor_id: PHASE4_IDS.personA,
        handler_id: PHASE4_IDS.personA,
        exhibitor_user_id: PHASE4_IDS.exhibitorA,
        status: 'waiting',
        offered_at: null,
        offer_expires_at: null,
        promoted_entry_id: null,
        updated_at: SEED_TS,
      },
    },
    threads: {},
    messages: [],
    sequence: 0,
  };
}

/**
 * Returns a fresh, fully-isolated state object. Uses structuredClone so nested
 * records are deep copies — no test can leak mutations into another.
 */
export function createPhase4SeamState(): Phase4SeamState {
  return structuredClone(seedState());
}
