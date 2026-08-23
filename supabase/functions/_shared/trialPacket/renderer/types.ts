/**
 * The entry fields the packet actually renders.
 *
 * Declared here rather than imported from `@/lib/reports/types` so this module
 * has NO app-alias imports and can be read by a Deno edge function as-is
 * (MYK9-228 phase 2). The app's `ReportEntry` satisfies this structurally, so
 * every existing caller keeps working without a cast.
 */
export interface PacketReportEntry {
  id: string;
  armband: number;
  runOrder: number | null;
  callName: string;
  breed: string;
  handler: string;
  registrationNumber: string | null;
  section: string | null;
  classId?: string | undefined;
  classElement?: string | undefined;
  classLevel?: string | undefined;
  classSection?: string | undefined;
  trialId?: string | undefined;
  // Present on the app's ReportEntry and harmlessly carried through. Declared
  // so a caller passing a literal is not tripped by excess-property checking,
  // and so it is visible what this module chooses NOT to render.
  dogId?: string | undefined;
  checkInStatus?: string | null | undefined;
  isScored?: boolean | undefined;
  resultText?: string | null | undefined;
  searchTimeSeconds?: number | null | undefined;
  totalFaults?: number | null | undefined;
  finalPlacement?: number | null | undefined;
}

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
  /**
   * Where the class runs, when that is a thing this sport has. Scent work does
   * not use rings; conformation and obedience usually do. Null means "no ring",
   * NOT "unassigned" — nothing in the schema persists a ring today, so a
   * placeholder would be a claim about configuration rather than a fact.
   */
  ringLabel: string | null;
  startTime: string | null;
  timeLimitSeconds: number | null;
  // A scent work class can search several areas, each with its own maximum.
  // A sheet showing only the first is wrong at areas 2 and 3, not merely thin.
  timeLimitArea2Seconds: number | null;
  timeLimitArea3Seconds: number | null;
  /** Authoritative count of areas searched — not "how many limits are filled in". */
  numAreas: number | null;
  /** Hide count for the class header. Null means "not configured", not zero. */
  numHides: number | null;
  /** Distraction count for the class header. Null means "not configured". */
  distractionCount: number | null;
}

export interface EmergencyPacketInput {
  generatedAt: string;
  show: EmergencyPacketShow;
  trials: EmergencyPacketTrial[];
  classes: EmergencyPacketClass[];
  entries: PacketReportEntry[];
}

export type EmergencyPacketPageKind =
  'cover' | 'catalog' | 'check-in' | 'score-recording' | 'certification' | 'transcription';

export interface EmergencyPacketPageContext {
  showName: string;
  trialDate: string;
  trialLabel?: string;
  ringLabel?: string | undefined;
  classLabel?: string;
  judgeName?: string;
  timeLimitLabel?: string | undefined;
}

export interface EmergencyPacketEntry extends PacketReportEntry {
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

/** One trial day's worth of packet input — see `splitPacketInputByTrialDay`. */
export interface EmergencyPacketDay {
  trialDate: string;
  input: EmergencyPacketInput;
}

export interface EmergencyPacketModel {
  generatedAt: string;
  show: EmergencyPacketShow;
  trials: EmergencyPacketTrialSection[];
  pages: EmergencyPacketPage[];
}

export type EmergencyPacketAvailability =
  { available: true } | { available: false; reason: string };

export interface EmergencyPacketDeliveryResult {
  snapshotId: string;
  generatedAt: string;
  recipientCount: number;
  linkExpiresAt: string;
  pageCount: number;
}
