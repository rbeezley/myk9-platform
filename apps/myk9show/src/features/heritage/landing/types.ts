/**
 * Prop types for the Heritage Landing Page and its 11 sections.
 * All sections receive only what they need — no god-object prop drilling.
 */

export interface HeritageTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  element?: string;
  judge?: string;
  judgeName?: string;
}

export interface HeritageJudge {
  id: string;
  name: string;
  city?: string | null;
  trials: string[]; // e.g. ["I", "III", "V"]
  elements: string[]; // panel elements they're judging
}

export interface HeritageJourneyStep {
  date: string | null; // ISO or null if not yet set
  label: string;
  description: string;
  status: 'done' | 'active' | 'future';
}

export interface HeritageOfficer {
  title: string;
  name: string;
}

export interface HeritageFee {
  label: string;
  amount: string; // pre-formatted, e.g. "$25.00"
}

export interface HeritageAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
  type?: string; // "Lodging" | "Emergency Vet"
}

/** All data needed by HeritageLandingPage, assembled by useHeritageLandingData. */
export interface HeritageLandingData {
  // Show-level
  clubName: string;
  showName: string;
  showSubtitle: string; // e.g. "An A.K.C. Licensed Trial · Six Trials Over Three Days"
  welcomeText: string | null;
  trialChairName: string | null;

  // Dates (ISO strings or null)
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

  // Trial structure
  trials: HeritageTrial[];
  judges: HeritageJudge[];

  // Capacity
  entryCount: number;
  entryLimit: number | null;

  // Fees
  fees: HeritageFee[];

  // Officers
  officers: HeritageOfficer[];

  // Plan / logistics
  accommodations: HeritageAccommodation[];
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;

  // Contact
  secretaryName: string | null;
  secretaryEmail: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  // Journey timeline (derived from dates)
  journeySteps: HeritageJourneyStep[];

  // Entry wizard link
  entryWizardUrl: string;
}
