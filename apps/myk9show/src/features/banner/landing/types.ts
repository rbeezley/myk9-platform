/**
 * Prop types for BannerLandingPage and its sections. Mirrors the
 * Monogram landing shape — most fields flow identically, with the
 * `brandColors` bundle added to carry the per-club flag derivation.
 */

import type { BannerBrandColors } from '../hooks/useBannerBrandColor';
import type {
  LandingAccommodation,
  LandingData,
  LandingFee,
  LandingJudge,
  LandingTrial,
} from '@/features/_shared/landing/landingData';

export type BannerTrial = LandingTrial;

export interface BannerJudge extends LandingJudge {
  /** "TRIALS 01 · 03 · 05" — the panel label used in the judge card. */
  trialsLabel: string | null;
  city: string | null;
  /** Element panel summary, e.g. "Containers · Interiors · Buried". */
  elementPanel: string | null;
  bio: string | null;
}

export interface BannerOfficer {
  title: string;
  name: string;
  email?: string | null;
}

export interface BannerFee extends LandingFee {
  /** Optional sub-line explaining the fee. */
  sub?: string;
}

export type BannerAccommodation = LandingAccommodation;

export interface BannerOnDayItem {
  label: string;
  value: string;
}

export interface BannerLandingData extends LandingData<
  BannerTrial,
  BannerJudge,
  BannerFee,
  BannerAccommodation
> {
  /** Per-club brand color bundle from useBannerBrandColor. */
  brandColors: BannerBrandColors;

  // Officers
  officers: BannerOfficer[];

  // Plan / On the day
  onTheDay: BannerOnDayItem[];
}
