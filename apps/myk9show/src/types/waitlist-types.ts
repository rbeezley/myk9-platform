// Types for the wait list and judge-day capacity system

export type MailInStrategy = 'fixed' | 'percentage' | 'deadline' | 'none';

export interface WaitListShowConfig {
  defaultJudgeDayCapacity: number;
  mailInStrategy: MailInStrategy;
  mailInValue: number | null;
  mailInDeadline: string | null; // ISO date
  mailInAutoRelease: boolean;
  mailInReleaseDate: string | null; // ISO date
  waitlistPaymentDeadlineHours: number;
}

export interface JudgeDayCapacity {
  judgeId: string;
  judgeName: string;
  showDate: string; // ISO date
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
  mailInReserved: number;
  availableSpots: number;
  classIds: string[];
  classNames: string[];
}

export interface WaitListEntry {
  id: string;
  classId: string;
  className: string;
  showName: string;
  exhibitorId: string;
  exhibitorName: string;
  dogId: string | null;
  dogName: string;
  handlerId: string | null;
  position: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  /** Mail-in offers remain held until staff records payment or withdraws them. */
  joinedVia: 'online' | 'mail_in' | null;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  /** The class's trial timezone, resolved through getTrialTimezone. Exhibitor reads only. */
  trialTimezone?: string;
  promotedEntryId: string | null;
  createdAt: string;
}
