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

export interface PosterTrial extends LandingTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface PosterJudge extends LandingJudge {
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

export interface PosterOfficer {
  title: string;
  name: string;
  email?: string | null;
}

export interface PosterFee extends LandingFee {
  label: string;
  amount: string;
  /** Optional sub-line explaining the fee. */
  sub?: string;
}

export interface PosterAccommodation extends LandingAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string;
}

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
  trials: PosterTrial[];
  judges: PosterJudge[];

  // Capacity
  entryCount: number | null;
  entryLimit: number | null;

  // Fees
  fees: PosterFee[];

  // Officers
  officers: PosterOfficer[];

  // Plan / On the day
  onTheDay: PosterOnDayItem[];
  accommodations: PosterAccommodation[];
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
