import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingJourneyStep,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

/**
 * Prop types for the Gazette Landing Page and its 11 sections.
 *
 * The Gazette data shape is largely a renamed superset of Heritage's —
 * we deliberately keep semantically identical fields so a future
 * pattern-extraction (Phase 2 of the styles refactor) can lift them
 * out into a shared `LandingData` type. The dual-source rule for the
 * present session: build only what Gazette needs.
 */

export interface GazetteTrial extends LandingTrial {
  element?: string;
  judge?: string;
}

export interface GazetteJudge extends LandingJudge {
  /** Roman-numeral trial labels this judge sits, e.g. ["i", "iii", "v"]. */
  /** Optional hall identifier, e.g. "Hall A". */
  hall?: string | null;
  /** Short bio paragraph, italic-supported. */
  bio?: string | null;
}

export interface GazetteOfficer {
  title: string;
  name: string;
}

export type GazetteFee = LandingFee;

export interface GazetteAccommodation extends LandingAccommodation {
  /** "Lodging", "Emergency Vet", "Hospitality", "Awards" — drives classifieds category caps. */
  type?: string;
  /** Free-form body for the classified card. */
  description?: string;
  /** Dotted meta line, e.g. "0.4 MI · $129/NT · CODE BCKC26". */
  meta?: string;
}

export interface GazetteScheduleItem {
  /** Display time, e.g. "7:00 AM". */
  time: string;
  /** Event description. */
  event: string;
  /** Hall column on the right, e.g. "Hall A". Hidden under 900px. */
  hall?: string | null;
}

export type GazetteJourneyStep = LandingJourneyStep;

/** All data needed by GazetteLandingPage, assembled by useGazetteLandingData. */
export interface GazetteLandingData extends LandingData<
  GazetteTrial,
  GazetteJudge,
  GazetteFee,
  GazetteAccommodation
> {
  // Masthead / show-level
  trialChairTitle: string | null;

  // Visual metadata (display-only; not stored)
  volumeRoman: string;
  edition: number | null;
  motto: string;
  established: string | null;
  cityLabel: string | null;

  // Schedule (may be empty)
  schedule: GazetteScheduleItem[];

  // Officers
  officers: GazetteOfficer[];

  secretaryPhone: string | null;
}
