import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingJourneyStep,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

/**
 * Prop types for the Heritage Landing Page and its 11 sections.
 * All sections receive only what they need — no god-object prop drilling.
 */

export interface HeritageTrial extends LandingTrial {
  element?: string;
  judge?: string;
}

export type HeritageJudge = LandingJudge;

export type HeritageJourneyStep = LandingJourneyStep;

export interface HeritageOfficer {
  title: string;
  name: string;
}

export type HeritageFee = LandingFee;

export type HeritageAccommodation = LandingAccommodation;

/** All data needed by HeritageLandingPage, assembled by useHeritageLandingData. */
export interface HeritageLandingData extends LandingData<
  HeritageTrial,
  HeritageJudge,
  HeritageFee,
  HeritageAccommodation
> {
  // Officers
  officers: HeritageOfficer[];
}
