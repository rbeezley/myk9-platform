/**
 * Prop types for the Magazine Landing Page and its sections.
 *
 * Modeled after `features/heritage/landing/types.ts` — same data shape so the
 * shared assemblers (entry counts, journey steps, fees) can be re-used. The
 * Magazine-specific additions live in `MagazineLandingData`: image URLs for
 * the cover + judge portraits, the optional pull quote, and the derived
 * monogram letters used by both photo-placeholder slots.
 */

export interface MagazineTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  element?: string;
  judge?: string;
  judgeName?: string;
}

export interface MagazineJudge {
  id: string;
  name: string;
  city?: string | null;
  /** Already-formatted trial labels (e.g. ["i", "iii", "v"]). */
  trials: string[];
  /** Element names this judge is panelled for (e.g. ["Containers", "Interiors"]). */
  elements: string[];
  /** Plate caption rendered top-right on the portrait — "Plate I", "Plate II". */
  plateLabel: string;
  /** Initials overlaid on the portrait. */
  initials: string;
  /** Optional portrait URL. When null, the gradient placeholder renders. */
  portraitUrl: string | null;
}

export interface MagazineJourneyStep {
  date: string | null;
  label: string;
  description: string;
  status: 'done' | 'active' | 'future';
}

export interface MagazineOfficer {
  title: string;
  name: string;
}

export interface MagazineFee {
  label: string;
  /** Pre-formatted, e.g. "$25.00". */
  amount: string;
}

export interface MagazineAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

/** Assembled by `useMagazineLandingData`. Sections only receive this. */
export interface MagazineLandingData {
  // Identity
  clubName: string;
  /** 1–3 character monogram derived from club name. Used by cover +
   *  portrait placeholders. */
  monogramLetters: string;

  showName: string;
  showSubtitle: string;
  /** Welcome prose. Paragraphs delimited by double newline. Null hides the
   *  whole Welcome section. */
  welcomeText: string | null;
  trialChairName: string | null;

  /** Optional pull quote sourced from supplemental content. When null the
   *  pull-quote element does not render — there is no muted fallback. */
  pullQuote: string | null;
  pullQuoteAttribution: string | null;

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

  // Cover photograph
  coverImageUrl: string | null;
  /** Caption rendered over the cover (e.g. photographer credit). */
  coverCaption: string | null;

  // Trial structure
  trials: MagazineTrial[];
  judges: MagazineJudge[];

  // Capacity
  entryCount: number;
  entryLimit: number | null;

  fees: MagazineFee[];
  officers: MagazineOfficer[];
  accommodations: MagazineAccommodation[];
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;

  secretaryName: string | null;
  secretaryEmail: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  journeySteps: MagazineJourneyStep[];

  entryWizardUrl: string;
}
