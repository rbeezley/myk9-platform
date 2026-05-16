/**
 * Prop types for the Gazette Landing Page and its 11 sections.
 *
 * The Gazette data shape is largely a renamed superset of Heritage's —
 * we deliberately keep semantically identical fields so a future
 * pattern-extraction (Phase 2 of the styles refactor) can lift them
 * out into a shared `LandingData` type. The dual-source rule for the
 * present session: build only what Gazette needs.
 */

export interface GazetteTrial {
  id: string;
  trialNumber: number | string;
  date: string | null;
  element?: string;
  judge?: string;
  judgeName?: string;
}

export interface GazetteJudge {
  id: string;
  name: string;
  city?: string | null;
  /** Roman-numeral trial labels this judge sits, e.g. ["i", "iii", "v"]. */
  trials: string[];
  /** Optional hall identifier, e.g. "Hall A". */
  hall?: string | null;
  elements: string[];
  /** Short bio paragraph, italic-supported. */
  bio?: string | null;
}

export interface GazetteOfficer {
  title: string;
  name: string;
}

export interface GazetteFee {
  label: string;
  amount: string;
}

export interface GazetteAccommodation {
  name: string;
  address?: string;
  phone?: string;
  url?: string;
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

export interface GazetteJourneyStep {
  date: string | null;
  label: string;
  description: string;
  status: 'done' | 'active' | 'future';
}

/** All data needed by GazetteLandingPage, assembled by useGazetteLandingData. */
export interface GazetteLandingData {
  // Masthead / show-level
  clubName: string;
  showName: string;
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;
  trialChairTitle: string | null;

  // Visual metadata (display-only; not stored)
  volumeRoman: string;
  edition: number | null;
  motto: string;
  established: string | null;
  cityLabel: string | null;

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

  // Structure
  trials: GazetteTrial[];
  judges: GazetteJudge[];

  // Capacity
  entryCount: number;
  entryLimit: number | null;

  // Particulars facts (formatted for the dl)
  fees: GazetteFee[];

  // Plan / logistics → classifieds
  accommodations: GazetteAccommodation[];
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;

  // Schedule (may be empty)
  schedule: GazetteScheduleItem[];

  // Officers
  officers: GazetteOfficer[];

  // Contact
  secretaryName: string | null;
  secretaryEmail: string | null;
  secretaryPhone: string | null;

  // Registry
  licenseLanguage: string;
  memberClubLanguage: string;

  // Journey timeline
  journeySteps: GazetteJourneyStep[];

  // Entry wizard link
  entryWizardUrl: string;
}
