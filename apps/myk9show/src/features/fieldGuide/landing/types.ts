import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

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

export type FieldGuideTrial = LandingTrial;

export interface FieldGuideJudge extends LandingJudge {
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

export interface FieldGuideFee extends LandingFee {
  /** Mono uppercase label, e.g. "FIRST ENTRY". */
  /** Display amount, e.g. "$25.00". */
  /** Mono caption beneath the number, e.g. "PER DOG / PER TRIAL". */
  sub?: string;
}

export type FieldGuideAccommodation = LandingAccommodation;

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

export interface FieldGuideLandingData extends LandingData<
  FieldGuideTrial,
  FieldGuideJudge,
  FieldGuideFee,
  FieldGuideAccommodation
> {
  // Show identity
  /** Compact ID for the top strip — e.g. "BCKC.2026.SS". Derived from the
   *  show + year + slug; falls back to the raw show name uppercased if no
   *  better source is available. */
  showCode: string;
  /** One-line description of what this is. Mono-orange-deep below the
   *  hero title. */
  trialChairEmail: string | null;

  // Hero quick-ref cells (typically 6)
  quickRefCells: FieldGuideQuickRefCell[];

  // Officers
  officers: FieldGuideOfficer[];

  // Plan / on the day
  onTheDay: FieldGuideOnDayItem[];
}
