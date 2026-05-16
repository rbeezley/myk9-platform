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

// ─── Poster Confirmation Email ───────────────────────────────────────────────

export interface PosterRunRow {
  /** Zero-padded numeral from trial_number, e.g. "01", "03". */
  trialNumeral: string;
  /** Formatted date, e.g. "FRI JUN 12". */
  dayLabel: string;
  /** "EX · Containers" */
  classLabel: string;
  /** Judge display name. */
  judgeName: string;
  /** Armband number (may be null if not yet assigned). */
  armband: string | null;
}

export interface PosterConfirmationProps {
  // Header / masthead
  clubName: string;
  clubCity: string | null;
  showTitle: string;
  /** e.g. "Jun 12–14, 2026" */
  dateRange: string;
  /** Show abbreviation, e.g. "SS'26" — used in the top mono strip. */
  showAbbreviation: string | null;

  // Greeting
  /** Full salutation name, e.g. "Sarah" */
  salutation: string;

  // Hero
  /** Primary armband number for the headline. May be null. */
  armband: string | null;

  // Entry detail card
  dogRegisteredName: string;
  dogCallName: string | null;
  dogBreed: string | null;
  dogSex: string | null;
  runs: PosterRunRow[];
  runCount: number;
  totalFeesFormatted: string;
  /** e.g. "2026-0137" */
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
  licenseLanguage: string;
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
