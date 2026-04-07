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
}

export interface SubmissionData {
  show: SubmissionShow;
  trial: SubmissionTrial;
  entries: SubmissionEntry[];
}

export interface ResultFormatter {
  /** Sanctioning organization, e.g. 'AKC' */
  organization: string;
  /** Sport type slug, e.g. 'scent_work' */
  sportType: string;
  /** Produce the XML string for electronic submission */
  formatXml(data: SubmissionData): string;
}
