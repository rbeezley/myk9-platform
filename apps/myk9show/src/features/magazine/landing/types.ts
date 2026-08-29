import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingJourneyStep,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

/**
 * Prop types for the Magazine Landing Page and its sections.
 *
 * Modeled after `features/heritage/landing/types.ts` — same data shape so the
 * shared assemblers (entry counts, journey steps, fees) can be re-used. The
 * Magazine-specific additions live in `MagazineLandingData`: image URLs for
 * the cover + judge portraits, the optional pull quote, and the derived
 * monogram letters used by both photo-placeholder slots.
 */

export interface MagazineTrial extends LandingTrial {
  element?: string;
  judge?: string;
}

export interface MagazineJudge extends LandingJudge {
  /** Already-formatted trial labels (e.g. ["i", "iii", "v"]). */
  /** Element names this judge is panelled for (e.g. ["Containers", "Interiors"]). */
  /** Plate caption rendered top-right on the portrait — "Plate I", "Plate II". */
  plateLabel: string;
  /** Initials overlaid on the portrait. */
  initials: string;
  /** Optional portrait URL. When null, the gradient placeholder renders. */
  portraitUrl: string | null;
}

export type MagazineJourneyStep = LandingJourneyStep;

export interface MagazineOfficer {
  title: string;
  name: string;
}

export type MagazineFee = LandingFee;

export type MagazineAccommodation = LandingAccommodation;

/** Assembled by `useMagazineLandingData`. Sections only receive this. */
export interface MagazineLandingData extends LandingData<
  MagazineTrial,
  MagazineJudge,
  MagazineFee,
  MagazineAccommodation
> {
  // Identity
  /** 1–3 character monogram derived from club name. Used by cover +
   *  portrait placeholders. */
  monogramLetters: string;

  /** Caption rendered over the cover (e.g. photographer credit). */
  coverCaption: string | null;

  officers: MagazineOfficer[];
}
