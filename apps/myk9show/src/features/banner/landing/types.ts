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

export interface BannerTrial extends LandingTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface BannerJudge extends LandingJudge {
  id: string;
  name: string;
  /** "TRIALS 01 · 03 · 05" — the panel label used in the judge card. */
  trialsLabel: string | null;
  trials: string[];
  elements: string[];
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
  label: string;
  amount: string;
  /** Optional sub-line explaining the fee. */
  sub?: string;
}

export interface BannerAccommodation extends LandingAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

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

  // Show-level
  clubName: string;
  showName: string;
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;

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
  trials: BannerTrial[];
  judges: BannerJudge[];

  // Capacity
  entryCount: number | null;
  entryLimit: number | null;

  // Fees
  fees: BannerFee[];

  // Officers
  officers: BannerOfficer[];

  // Plan / On the day
  onTheDay: BannerOnDayItem[];
  accommodations: BannerAccommodation[];
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;

  // Contact
  secretaryName: string | null;
  secretaryEmail: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  // Entry wizard link
  entryWizardUrl: string;
}
