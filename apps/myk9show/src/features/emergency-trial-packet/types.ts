import type { ReportEntry } from '@/lib/reports/types';

export const EMERGENCY_PACKET_MARKER = 'SNAPSHOT — NOT LIVE' as const;

export interface EmergencyPacketShow {
  id: string;
  name: string;
  clubName?: string;
  organization?: string;
  startDate: string;
  endDate: string;
}

export interface EmergencyPacketTrial {
  id: string;
  date: string;
  name: string;
  trialNumber: string;
  registryId: string;
}

export interface EmergencyPacketClass {
  id: string;
  trialId: string;
  name: string;
  element: string;
  level: string;
  section: string | null;
  classNumber: string | null;
  displayOrder: number | null;
  judgeName: string;
  ringLabel: string;
  startTime: string | null;
  timeLimitSeconds: number | null;
  // A scent work class can search several areas, each with its own maximum.
  // A sheet showing only the first is wrong at areas 2 and 3, not merely thin.
  timeLimitArea2Seconds: number | null;
  timeLimitArea3Seconds: number | null;
  /** Authoritative count of areas searched — not "how many limits are filled in". */
  numAreas: number | null;
}

export interface EmergencyPacketInput {
  generatedAt: string;
  show: EmergencyPacketShow;
  trials: EmergencyPacketTrial[];
  classes: EmergencyPacketClass[];
  entries: ReportEntry[];
}

export type EmergencyPacketPageKind =
  | 'cover'
  | 'catalog'
  | 'check-in'
  | 'score-recording'
  | 'certification'
  | 'transcription';

export interface EmergencyPacketPageContext {
  showName: string;
  trialDate: string;
  trialLabel?: string;
  ringLabel?: string;
  classLabel?: string;
  judgeName?: string;
  timeLimitLabel?: string | undefined;
}

export interface EmergencyPacketEntry extends ReportEntry {
  checkInMark: '';
  resultMark: '';
  runOrderDisplay: string;
}

export interface EmergencyPacketPage {
  kind: EmergencyPacketPageKind;
  title: string;
  pageNumber: number;
  marker: typeof EMERGENCY_PACKET_MARKER;
  generatedAt: string;
  context: EmergencyPacketPageContext;
  entries: EmergencyPacketEntry[];
}

export interface EmergencyPacketTrialSection extends EmergencyPacketTrial {
  classes: EmergencyPacketClass[];
}

export interface EmergencyPacketModel {
  generatedAt: string;
  show: EmergencyPacketShow;
  trials: EmergencyPacketTrialSection[];
  pages: EmergencyPacketPage[];
}

export type EmergencyPacketAvailability =
  | { available: true }
  | { available: false; reason: string };

export interface EmergencyPacketDeliveryResult {
  snapshotId: string;
  generatedAt: string;
  recipientCount: number;
  linkExpiresAt: string;
  pageCount: number;
}
