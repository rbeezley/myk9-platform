import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { isOfferedWaitlistEntry, isQueuedWaitlistEntry } from '@/utils/waitlistCountSelectors';
import type { WaitingList } from './types';

/** The class facts the calculation reads (`ClassWithWaitlistCount` satisfies it). */
export interface WaitlistSpotClass {
  id: string;
  name: string;
  trialId?: string | undefined;
  /** The class's own limit; null or 0 means none. */
  maxEntries: number | null | undefined;
  /** Entries holding a seat (`countSeatHoldingEntries`), a pending-payment offer included. */
  seatHoldingCount: number;
}

/** The waitlist row facts the calculation reads. */
export interface WaitlistSpotEntry {
  id: string;
  classId: string;
  dogId: string;
  status: string | null | undefined;
  position: number;
  createdAt?: string | null | undefined;
  offerExpiresAt?: string | null | undefined;
  joinedVia?: 'online' | 'mail_in' | null | undefined;
}

/** Why a class has, or has no, spot to offer. */
export type ClassSpotReason =
  | 'open'
  | 'no-one-waiting'
  | 'class-full'
  | 'judge-day-full'
  /** Dogs are waiting but the server's judge-day figures are not loaded (offline). */
  | 'judge-day-unknown'
  /** Every free spot already has a dog offered it; nothing left to offer. */
  | 'offers-cover-spots';

export interface ClassSpotState {
  classId: string;
  className: string;
  reason: ClassSpotReason;
  /** Spots a secretary could offer now: the smaller of the two limits' room. 0 unless `open`. */
  spotsOpen: number;
  /** Dogs waiting, in join order. */
  queued: WaitlistSpotEntry[];
  /** The first queued dog with no open offer; null when none. */
  nextInLine: WaitlistSpotEntry | null;
  openOffers: WaitlistSpotEntry[];
  /** Names the limit in the way, in the secretary's words; null when `open` or nobody waits. */
  explanation: string | null;
}

export interface WaitlistSpots extends WaitingList<ClassSpotState> {
  /** Every class that has dogs waiting or an open offer, whether or not it has a spot. */
  classes: ClassSpotState[];
}

function weekdayOf(showDate: string): string {
  const date = new Date(`${showDate.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? showDate
    : date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

const isQueued = (entry: WaitlistSpotEntry) =>
  isQueuedWaitlistEntry({ status: entry.status ?? null });
const isOffered = (entry: WaitlistSpotEntry) =>
  isOfferedWaitlistEntry({ status: entry.status ?? null });

function byJoinOrder(a: WaitlistSpotEntry, b: WaitlistSpotEntry): number {
  return a.position - b.position || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

/**
 * Classes with a spot a secretary can offer, and a dog waiting to take it ("a spot is open").
 *
 * A spot is open only when BOTH limits have room: the class's own limit (rare) and the judge's
 * limit for the day. Judge-day room is the server's own answer (`judgeDays`, from
 * `get_show_judge_day_capacity_for_manager`, which wraps `get_judge_day_capacity_live`); it is
 * never recomputed from entries here. `judgeDays: null` means that answer is not loaded.
 *
 * An offer holds its seat from the moment it is made: it creates a pending-payment entry that the
 * server counts toward both limits (`promote_waitlist_entry_internal`), so `seatHoldingCount` and
 * the judge-day figures already include open offers. They are not subtracted again; an offer only
 * decides the reason ("offers-cover-spots") and which dog is next in line.
 */
export function findOpenWaitlistSpots(input: {
  classes: readonly WaitlistSpotClass[];
  waitlist: readonly WaitlistSpotEntry[];
  judgeDays: readonly JudgeDayCapacity[] | null;
}): WaitlistSpots {
  const states: ClassSpotState[] = [];
  for (const cls of input.classes) {
    const rows = input.waitlist.filter(entry => entry.classId === cls.id);
    const queued = rows.filter(isQueued).sort(byJoinOrder);
    const openOffers = rows.filter(isOffered);
    if (queued.length === 0 && openOffers.length === 0) continue;

    const offeredDogs = new Set(openOffers.map(offer => offer.dogId));
    const nextInLine = queued.find(entry => !offeredDogs.has(entry.dogId)) ?? null;
    const base = { classId: cls.id, className: cls.name, queued, nextInLine, openOffers };

    const classRoom = cls.maxEntries
      ? Math.max(0, cls.maxEntries - cls.seatHoldingCount)
      : Number.POSITIVE_INFINITY;
    const classJudgeDays = (input.judgeDays ?? []).filter(day => day.classIds.includes(cls.id));
    const fullDay = classJudgeDays.find(day => day.availableSpots <= 0);
    const judgeRoom = classJudgeDays.length
      ? Math.min(...classJudgeDays.map(day => Math.max(0, day.availableSpots)))
      : Number.POSITIVE_INFINITY;

    const held = openOffers.length;
    // Would both limits have room if the open offers were not holding their seats?
    const roomWithoutOffers = Math.min(classRoom, judgeRoom) + held;
    const offersHoldTheSpots = held > 0 && roomWithoutOffers > 0;

    let state: ClassSpotState;
    if (!nextInLine) {
      state = { ...base, reason: 'no-one-waiting', spotsOpen: 0, explanation: null };
    } else if (input.judgeDays === null) {
      state = { ...base, reason: 'judge-day-unknown', spotsOpen: 0, explanation: null };
    } else if (Math.min(classRoom, judgeRoom) === 0 && offersHoldTheSpots) {
      state = {
        ...base,
        reason: 'offers-cover-spots',
        spotsOpen: 0,
        explanation: `${cls.name}: every open spot has been offered. Nothing left to offer.`,
      };
    } else if (judgeRoom === 0 && fullDay) {
      const day = weekdayOf(fullDay.showDate);
      state = {
        ...base,
        reason: 'judge-day-full',
        spotsOpen: 0,
        explanation:
          classRoom > 0
            ? `${cls.name} has room, but ${fullDay.judgeName}'s ${day} is full.`
            : `${cls.name} is full, and so is ${fullDay.judgeName}'s ${day}.`,
      };
    } else if (classRoom === 0) {
      state = {
        ...base,
        reason: 'class-full',
        spotsOpen: 0,
        explanation: `${cls.name} is full.`,
      };
    } else {
      state = {
        ...base,
        reason: 'open',
        spotsOpen: Math.min(classRoom, judgeRoom),
        explanation: null,
      };
    }
    states.push(state);
  }
  const rows = states.filter(state => state.reason === 'open');
  return { count: rows.length, rows, classes: states };
}
