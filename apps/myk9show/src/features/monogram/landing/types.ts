/**
 * Prop types for MonogramLandingPage and its 10 sections.
 * Mirrors the Heritage landing shape — most data flows identically, with
 * `monogramLetters` added as the Monogram-specific derivation.
 */

export interface MonogramTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface MonogramJudge {
  id: string;
  name: string;
  /** Pre-derived 2-letter initials shown as the bronze portrait monogram. */
  initials: string;
  /** Uppercase-roman trial numbers this judge is assigned to (e.g. ["I", "III"]).
   *  Not yet surfaced in the JudgesSection UI; preserved so a future
   *  "Trials I & III" credential line can read it without re-deriving. */
  trials: string[];
  /** Trial-panel summary like "Containers · Interiors". */
  credential: string | null;
  /** Optional bio paragraph, displayed below the credential line. */
  bio: string | null;
}

export interface MonogramOfficer {
  /** Role title, e.g. "Trial Chair". Rendered as bronze small-caps eyebrow. */
  title: string;
  name: string;
  /** Optional contact email — the mock shows secretary@bckc.org style addresses. */
  email?: string | null;
}

export interface MonogramFee {
  label: string;
  /** Pre-formatted, e.g. "$25.00". */
  amount: string;
}

export interface MonogramAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

export interface MonogramPlanItem {
  /** Small-caps label, e.g. "Doors", "First class". */
  label: string;
  /** Display value text. */
  value: string;
  /** When true, render in Crimson Pro 15px (body prose). When false/omitted,
   *  render in Bodoni Moda 18px (short display value). Callers know which is
   *  intended; we never guess from string length. */
  isBody?: boolean;
}

export interface MonogramLandingData {
  /** Pre-derived club initials (e.g. "BC") used by hero, nav, footer, final CTA. */
  monogramLetters: string;

  // Show-level
  clubName: string;
  showName: string;
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;

  // Dates (ISO strings or null)
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  timezone: string;

  // Venue
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;

  // Trial structure
  trials: MonogramTrial[];
  judges: MonogramJudge[];

  // Capacity
  entryCount: number;
  entryLimit: number | null;

  // Fees
  fees: MonogramFee[];

  // Officers
  officers: MonogramOfficer[];

  // Plan / On-the-day (two-col section folio v). Once the schema grows
  // structured day-of-event data, add an `onTheDay: MonogramPlanItem[]`
  // field here and source it from supplemental experience snapshots.
  accommodations: MonogramAccommodation[];
  hospitalityNotes: string | null;

  // Contact
  secretaryName: string | null;
  secretaryEmail: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  // Entry wizard link
  entryWizardUrl: string;
}
