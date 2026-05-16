/**
 * Prop types for FieldGuideLandingPage and its sections. Mirrors the
 * Banner / Monogram landing shape, with two Field-Guide-specific
 * additions:
 *   - `quickRefCells` for the 6-cell hero data grid
 *   - `judges[].trialsLabel` for the chip-tagged "TRIALS 01·03·05" header
 *
 * Field Guide is fully fixed (no per-club brand color), so there's no
 * `brandColors` bundle here. The indicator-orange palette is hardcoded in
 * `tokens.ts`.
 */

export interface FieldGuideTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface FieldGuideJudge {
  id: string;
  name: string;
  /** "TRIALS 01·03·05" — chip label rendered above the judge's name. */
  trialsLabel: string | null;
  city: string | null;
  /** Element panel summary, e.g. "Containers · Interiors · Buried". */
  elementPanel: string | null;
  bio: string | null;
}

export interface FieldGuideOfficer {
  title: string;
  name: string;
  email?: string | null;
}

export interface FieldGuideFee {
  /** Mono uppercase label, e.g. "FIRST ENTRY". */
  label: string;
  /** Display amount, e.g. "$25.00". */
  amount: string;
  /** Mono caption beneath the number, e.g. "PER DOG / PER TRIAL". */
  sub?: string;
}

export interface FieldGuideAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

export interface FieldGuideOnDayItem {
  label: string;
  value: string;
}

export interface FieldGuideQuickRefCell {
  label: string;
  value: string;
  /** Paint the value in orange-deep when true (e.g. CLOSES is the
   *  most-asked-about cell). */
  emphasis?: boolean;
}

export interface FieldGuideLandingData {
  // Show identity
  /** Compact ID for the top strip — e.g. "BCKC.2026.SS". Derived from the
   *  show + year + slug; falls back to the raw show name uppercased if no
   *  better source is available. */
  showCode: string;
  clubName: string;
  showName: string;
  /** One-line description of what this is. Mono-orange-deep below the
   *  hero title. */
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;
  trialChairEmail: string | null;

  // Dates
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

  // Trials + judges
  trials: FieldGuideTrial[];
  judges: FieldGuideJudge[];

  // Capacity
  entryCount: number;
  entryLimit: number | null;

  // Hero quick-ref cells (typically 6)
  quickRefCells: FieldGuideQuickRefCell[];

  // Fees
  fees: FieldGuideFee[];

  // Officers
  officers: FieldGuideOfficer[];

  // Plan / on the day
  onTheDay: FieldGuideOnDayItem[];
  accommodations: FieldGuideAccommodation[];
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
