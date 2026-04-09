// packages/secretary/src/results/types.ts

/**
 * Types for electronic result submission to sanctioning organizations.
 */

export interface SubmissionEntry {
  /** Call name / dog name */
  dogName: string;
  breed: string;
  /** Sanctioning registration number (AKC, UKC, etc.) */
  registrationNumber: string | null;
  handlerName: string;
  /** Class identifier, e.g. "Container - Advanced" */
  className: string;
  element: string;
  level: string;
  section: string | null;
  /** Raw result text as recorded by judge: 'Q', 'NQ', 'EXC', etc. */
  resultCode: string | null;
  /** Search time in seconds */
  searchTimeSeconds: number | null;
  /** Total fault count */
  totalFaults: number | null;
  /** Final placement within class (1 = first, null = not placed) */
  finalPlacement: number | null;
  /** Armband number assigned to this entry */
  armbandNumber: number;
  /** Trial this entry belongs to — used by formatters to group entries per event */
  trialId: string;
  /** Class this entry belongs to — used by formatters to group entries per class */
  classId: string;
}

export interface SubmissionShow {
  id: string;
  name: string;
  /** Club name that hosts the show */
  clubName: string | null;
  /** Show start date (ISO date string) */
  date: string | null;
  /** AKC/UKC club number or similar */
  clubLicenseNumber: string | null;
  /** Trial secretary full name — drives the <sender name> attribute */
  secretaryName: string | null;
  /** Trial secretary email — drives the <sender responseEmail> attribute */
  secretaryEmail: string | null;
}

export interface SubmissionTrial {
  id: string;
  trialNumber: string | number;
  date: string | null;
  judgeName: string;
  /** E.g. 'AKC', 'UKC', 'NACSW' */
  organization: string;
  /** E.g. 'scent_work', 'fast_cat' */
  sportType: string;
  /** Sanctioning organization event number (e.g. trials.event_number for AKC) */
  eventNumber: string | null;
}

export interface SubmissionData {
  show: SubmissionShow;
  /** All trials included in this submission (one <event> per trial for AKC) */
  trials: SubmissionTrial[];
  entries: SubmissionEntry[];
}

export interface ResultFormatter {
  /** Sanctioning organization, e.g. 'AKC' */
  organization: string;
  /** Sport type slug, e.g. 'scent_work' */
  sportType: string;
  /**
   * Destination email for electronic submission.
   * null means this formatter does not support direct email sending.
   */
  submissionEmail?: string | null;
  /** Produce the XML string for electronic submission */
  formatXml(data: SubmissionData): string;
}

// ---------------------------------------------------------------------------
// AKC-specific types
// ---------------------------------------------------------------------------

export interface AKCOwnerAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

/** Extends SubmissionEntry with fields required by the AKC electres.xsd schema */
export interface AKCSubmissionEntry extends SubmissionEntry {
  /** Registered name from dog_registrations (AKC org) — for dogName XML attribute */
  dogRegisteredName: string | null;
  /** D = dog (male), B = bitch (female) — from dogs.sex */
  dogGender: 'D' | 'B' | null;
  /** Owner full name (people.first_name + last_name) */
  ownerName: string | null;
  /** Owner mailing address */
  ownerAddress: AKCOwnerAddress | null;
  /** Class time limit in seconds — for courseTime on <class> element */
  timeLimitSeconds: number | null;
  /** entries.entry_status — 'accepted', 'withdrawn', etc. */
  entryStatus: string | null;
  /** entries.check_in_status — 'present', 'absent', etc. */
  checkInStatus: string | null;
  /** entries.result_status — 'Q', 'NQ', 'disqualified', 'excused', etc. */
  resultStatus: string | null;
}

export interface AKCSubmissionData {
  show: SubmissionShow;
  trials: SubmissionTrial[];
  entries: AKCSubmissionEntry[];
}
