export interface ConfirmEmailProps {
  confirmUrl: string;
  firstName: string;
}

export interface ResetPasswordProps {
  resetUrl: string;
  firstName: string;
}

// ─── Heritage Confirmation Email ─────────────────────────────────────────────

export interface HeritageRunRow {
  /** Roman numeral from trial_number, e.g. "I", "III". */
  trialNumeral: string;
  /** Formatted date, e.g. "Fri 12 Jun". */
  dayLabel: string;
  /** "Excellent · Containers" */
  classLabel: string;
  /** Judge display name. */
  judgeName: string;
  /** Armband number (may be null if not yet assigned). */
  armband: string | null;
}

export interface HeritageConfirmationProps {
  // Header
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  /** e.g. "12–14 June 2026" */
  dateRange: string;

  // Greeting
  /** "Ms. Patricia Holloway" — full salutation name */
  salutation: string;

  // Entry detail card
  dogRegisteredName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: HeritageRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  receiptNumber: string | null;

  // On the day
  doorsTime: string | null;
  firstClassTime: string | null;
  venueNameAndAddress: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;

  // Withdraw / contact
  secretaryEmail: string | null;
  secretaryPhone: string | null;

  // CTA
  trialUrl: string | null;

  // Signature
  trialChairName: string | null;
  trialChairTitle: string | null;

  // Footer
  memberClubLanguage: string;
  showSlug: string | null;
}

// ─── Monogram Confirmation Email ─────────────────────────────────────────────

export interface MonogramRunRow {
  /** Roman numeral from trial_number, e.g. "I", "III". */
  trialNumeral: string;
  /** Formatted date, e.g. "Fri 12 Jun". */
  dayLabel: string;
  /** "Excellent · Containers" */
  classLabel: string;
  /** Judge display name. */
  judgeName: string;
  /** Armband number (may be null if not yet assigned). */
  armband: string | null;
}

export interface MonogramConfirmationProps {
  // Header
  /** Pre-computed monogram initials (1–3 chars). Derive via buildMonogram(clubName). */
  monogramLetters: string;
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  /** e.g. "12–14 June 2026" */
  dateRange: string;

  // Greeting
  /** Full salutation name, e.g. "Ms. Patricia Holloway" */
  salutation: string;

  // Entry detail card
  dogRegisteredName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: MonogramRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  /** e.g. "Receipt № 2026-0137" */
  receiptNumber: string | null;

  // On the day
  doorsTime: string | null;
  firstClassTime: string | null;
  venueNameAndAddress: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;

  // Withdraw / contact
  secretaryEmail: string | null;
  secretaryPhone: string | null;

  // CTA
  trialUrl: string | null;

  // Signature
  trialChairName: string | null;
  trialChairTitle: string | null;

  // Footer
  memberClubLanguage: string;
  showSlug: string | null;
}

// ─── Banner Confirmation Email ───────────────────────────────────────────────

export interface BannerRunRow {
  /** Roman numeral from trial_number, e.g. "I", "III". */
  trialNumeral: string;
  /** Formatted date, e.g. "Fri 12 Jun". */
  dayLabel: string;
  /** "Excellent · Containers" */
  classLabel: string;
  /** Judge display name. */
  judgeName: string;
  /** Armband number (may be null if not yet assigned). */
  armband: string | null;
}

export interface BannerConfirmationProps {
  // Per-club brand color (precomputed in the Deno function — Outlook can't
  // do color-mix() or OKLCH, so all three siblings + the contrast pick
  // arrive ready to drop into inline styles).
  /** Flag hex from show.brand_color (or default teal). */
  brandColor: string;
  /** Darker sibling used on the final-CTA band background. */
  brandColorDeep: string;
  /** Brighter sibling used for the single emphasis word. */
  brandColorBright: string;
  /** WCAG-luminance-derived text color for on-flag content. */
  textOnFlag: '#ffffff' | '#111111';

  // Header / masthead
  clubName: string;
  clubCity: string | null;
  showTitle: string;
  /** e.g. "Jun 12–14, 2026" */
  dateRange: string;

  // Greeting
  /** Full salutation name, e.g. "Ms. Patricia Holloway" */
  salutation: string;

  // Entry detail card
  dogRegisteredName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: BannerRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  /** e.g. "Receipt 2026-0137" */
  receiptNumber: string | null;

  // On the day
  doorsTime: string | null;
  firstClassTime: string | null;
  venueNameAndAddress: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;

  // Withdraw / contact
  secretaryEmail: string | null;
  secretaryPhone: string | null;

  // CTA
  trialUrl: string | null;

  // Signature
  trialChairName: string | null;
  trialChairTitle: string | null;

  // Footer
  memberClubLanguage: string;
  showSlug: string | null;
}

// ─── Gazette Confirmation Email ──────────────────────────────────────────────
//
// Same shape as Heritage / Monogram / Banner — keeping props parallel
// lets a future shared assembler (`buildConfirmationProps`) feed any of
// the four templates without per-style branching.

export interface GazetteRunRow {
  /** Lowercase roman numeral from trial_number, e.g. "i", "iii". */
  trialNumeral: string;
  /** Formatted date, e.g. "Fri Jun 12". */
  dayLabel: string;
  /** "Excellent · Containers" */
  classLabel: string;
  /** Judge display name. */
  judgeName: string;
  /** Armband number (may be null if not yet assigned). */
  armband: string | null;
}

export interface GazetteConfirmationProps {
  // Masthead
  clubName: string;
  clubEstablished: string | null;
  clubCity: string | null;
  showTitle: string;
  /** e.g. "Jun 12–14, 2026" */
  dateRange: string;
  /** Optional edition meta strip, e.g. "VOL LXXIX · NO 47". Omit on
   *  Outlook-targeted sends per README §Open Questions Q5. */
  editionLabel: string | null;

  // Greeting
  salutation: string;

  // Entry detail card
  dogRegisteredName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: GazetteRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  /** e.g. "Receipt 2026-0137" */
  receiptNumber: string | null;

  // On the day
  doorsTime: string | null;
  firstClassTime: string | null;
  venueNameAndAddress: string | null;
  parkingNotes: string | null;
  hospitalityNotes: string | null;
  cratingNotes: string | null;

  // Withdraw / contact
  secretaryEmail: string | null;
  secretaryPhone: string | null;

  // CTA
  trialUrl: string | null;

  // Signature
  trialChairName: string | null;
  trialChairTitle: string | null;

  // Footer
  memberClubLanguage: string;
  showSlug: string | null;
}

export interface RegistrationConfirmationProps {
  firstName: string;
  confirmationNumber: string;
  show: {
    name: string;
    startDate: string;
    endDate: string;
    location: string;
    venue?: string;
    confirmationMessage?: string;
  };
  entries: Array<{
    dogName: string;
    className: string;
    armband?: string;
  }>;
  payment: {
    subtotal: number;
    discount?: number;
    total: number;
    method: string;
  };
}
