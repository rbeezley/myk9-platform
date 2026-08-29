import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

/**
 * Prop types for PosterLandingPage and its sections. Mirrors the Banner /
 * Monogram landing shape — Poster has no per-club brand-color override
 * (the palette is fixed), so the brand-color bundle is omitted.
 */

export type PosterTrial = LandingTrial;

export interface PosterJudge extends LandingJudge {
  /** "TRIALS 01 · 03 · 05" — the panel label used in the judge card. */
  trialsLabel: string | null;
  city: string | null;
  /** Element panel summary, e.g. "Containers · Interiors · Buried". */
  elementPanel: string | null;
  bio: string | null;
}

export interface PosterOfficer {
  title: string;
  name: string;
  email?: string | null;
}

export interface PosterFee extends LandingFee {
  /** Optional sub-line explaining the fee. */
  sub?: string;
}

export type PosterAccommodation = LandingAccommodation;

export interface PosterOnDayItem {
  label: string;
  value: string;
}

export interface PosterLandingData extends LandingData<
  PosterTrial,
  PosterJudge,
  PosterFee,
  PosterAccommodation
> {
  // Officers
  officers: PosterOfficer[];

  // Plan / On the day
  onTheDay: PosterOnDayItem[];
}
