/**
 * Prop types for PosterLandingPage and its sections. Mirrors the Banner /
 * Monogram landing shape — Poster has no per-club brand-color override
 * (the palette is fixed), so the brand-color bundle is omitted.
 */

export interface PosterTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  judgeName?: string;
}

export interface PosterJudge {
  id: string;
  name: string;
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

export interface PosterFee {
  label: string;
  amount: string;
  /** Optional sub-line explaining the fee. */
  sub?: string;
}

export interface PosterAccommodation {
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

export interface PosterLandingData {
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
  entryCount: number;
  entryLimit: number | null;

  // Fees
  fees: PosterFee[];

  // Officers
  officers: PosterOfficer[];

  // Plan / On the day
  onTheDay: PosterOnDayItem[];
  accommodations: PosterAccommodation[];
  hospitalityNotes: string | null;

  // Contact
  secretaryName: string | null;
  secretaryEmail: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  // Entry wizard link
  entryWizardUrl: string;
}
