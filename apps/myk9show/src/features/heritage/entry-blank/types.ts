// ─── Heritage Entry Blank — prop types ───────────────────────────────────────
//
// `buildEntryBlankProps` is the single assembly point. The PDF document and its
// sections are pure renderers — no hooks, no DB queries, just these props.

/** A single trial row in §II. */
export interface EntryBlankTrialRow {
  /** Roman-numeral label (I, II, III…) from trial_number or display_order. */
  numeral: string;
  /** Formatted date string, e.g. "Fri 12 Jun". */
  dateLabel: string;
  /** Elements offered in this trial (e.g. "Containers · Interiors · Buried"). */
  elementsLabel: string;
  /** Judge's display name, e.g. "C. Beagles". */
  judgeName: string;
  /** Pre-filled mode: mark this row with ✕. */
  checked: boolean;
}

/** A single class-level row in the §II level grid. */
export interface EntryBlankLevelCell {
  level: string;
  element: string;
  /** Pre-filled mode: mark with ✕. */
  checked: boolean;
}

/** Pre-filled dog particulars (§I). All nullable — blank mode leaves them null. */
export interface EntryBlankDog {
  registeredName: string | null;
  callName: string | null;
  breed: string | null;
  variety: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  registrationNumber: string | null;
  /** Sire/dam are not stored in the DB; always null in the current data model. */
  sire: null;
  dam: null;
  breeder: string | null;
  actualOwners: string | null;
}

/** Pre-filled owner/handler (§III). All nullable. */
export interface EntryBlankOwner {
  ownerName: string | null;
  handlerName: string | null;
  mailingAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  telephone: string | null;
  email: string | null;
  juniorHandlerAge: string | null;
}

/** Fee line items (§IV). */
export interface EntryBlankFees {
  firstEntryFee: string;
  additionalEntryFee: string;
  juniorHandlerFee: string;
  mailProcessingFee: string;
  /** Pre-filled total; null in blank mode. */
  totalAmount: string | null;
  /** Pre-filled payment method; null in blank mode. */
  paymentMethod: 'check' | 'money_order' | 'online' | null;
}

/** Mail-to panel (§VI). */
export interface EntryBlankMailTo {
  secretaryName: string | null;
  poBox: string | null;
  cityStateZip: string | null;
  email: string | null;
  emailSubject: string | null;
}

/** Full props bundle consumed by HeritageEntryBlankDocument. */
export interface EntryBlankProps {
  // ── Header ──
  clubName: string;
  showTitle: string;
  /** e.g. "An A.K.C. Licensed Trial" */
  licenseLanguage: string;
  /** e.g. "12 – 14 June 2026" */
  dateRange: string;
  /** ISO string for close date; rendered as "3 June 2026 · 8:00 PM Central". */
  entryCloseIso: string | null;
  /** IANA timezone for formatting entry-close time, e.g. "America/Chicago". */
  timezone: string;

  // ── §I ──
  dog: EntryBlankDog;

  // ── §II ──
  trials: EntryBlankTrialRow[];
  levelCells: EntryBlankLevelCell[];

  // ── §III ──
  owner: EntryBlankOwner;

  // ── §IV ──
  fees: EntryBlankFees;

  // ── §V agreement (full text sourced from registry) ──
  agreementText: string;

  // ── §VI ──
  mailTo: EntryBlankMailTo;

  // ── Footer ──
  /** Formatted close date for footer line, e.g. "3 June 2026". */
  closeDate: string | null;
  /** Formatted confirmation date, e.g. "6 June". */
  confirmationDate: string | null;
  /** Online entry URL, e.g. "myk9show.com/bckc-spring-2026". */
  onlineEntryUrl: string | null;
}
