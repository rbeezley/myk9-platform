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
  dogId: string;
  dogName: string;
  handlerId: string | null;
  position: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  offeredAt: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
}

export interface WaitListPromotion {
  waitlistEntryId: string;
  entryId: string; // the new entry created from promotion
  promotedAt: string;
  paymentDeadline: string; // ISO datetime
}
