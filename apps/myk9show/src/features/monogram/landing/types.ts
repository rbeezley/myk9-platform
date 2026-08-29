import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

/**
 * Prop types for MonogramLandingPage and its 10 sections.
 * Mirrors the Heritage landing shape — most data flows identically, with
 * `monogramLetters` added as the Monogram-specific derivation.
 */

export type MonogramTrial = LandingTrial;

export interface MonogramJudge extends LandingJudge {
  /** Pre-derived 2-letter initials shown as the bronze portrait monogram. */
  initials: string;
  /** Uppercase-roman trial numbers this judge is assigned to (e.g. ["I", "III"]).
   *  Not yet surfaced in the JudgesSection UI; preserved so a future
   *  "Trials I & III" credential line can read it without re-deriving. */
  city: string | null;
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

export type MonogramFee = LandingFee;

export type MonogramAccommodation = LandingAccommodation;

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

export interface MonogramLandingData extends LandingData<
  MonogramTrial,
  MonogramJudge,
  MonogramFee,
  MonogramAccommodation
> {
  /** Pre-derived club initials (e.g. "BC") used by hero, nav, footer, final CTA. */
  monogramLetters: string;

  // Officers
  officers: MonogramOfficer[];

  // Plan / On-the-day (two-col section folio v). Once the schema grows
  // structured day-of-event data, add an `onTheDay: MonogramPlanItem[]`
  // field here and source it from supplemental experience snapshots.
}
