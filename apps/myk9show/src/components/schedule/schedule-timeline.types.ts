import type { ClassStatusValue } from '@myk9/core';

/** Raw row from the schedule timeline query (overview) */
export interface TimelineClassRow {
  trialId: string;
  trialDate: string;
  trialNumber: string | null;
  trialPlannedStartTime: string | null;
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string; // raw DB status, needs normalizeClassStatus()
  totalEntriesCount: number;
}

/** Raw row from the trial timeline query (trial detail) */
export interface TrialTimelineClassRow {
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string; // raw DB status
  totalEntriesCount: number;
  judgePersonId: string | null;
  judgeFirstName: string | null;
  judgeLastName: string | null;
}

/** Processed element summary for display */
export interface ElementSummary {
  element: string;
  startTime: string | null;
  levelRange: string;
  status: ClassStatusValue;
  levels: LevelDetail[];
  /** Pre-computed: number of completed levels */
  completedCount: number;
  /** Pre-computed: number of non-cancelled levels */
  totalCount: number;
}

/** Individual level detail within an element */
export interface LevelDetail {
  classId: string;
  level: string;
  status: ClassStatusValue;
  entryCount: number;
}

/** A single trial's timeline data */
export interface TrialTimelineData {
  trialId: string;
  trialNumber: string | null;
  plannedStartTime: string | null;
  elements: ElementSummary[];
}

/** A day's worth of trials */
export interface DayTimelineData {
  date: string;
  trials: TrialTimelineData[];
}

/** Judge section for trial detail view */
export interface JudgeTimelineData {
  judgeId: string | null;
  judgeName: string;
  ringNumber: string | null;
  elements: ElementSummary[];
}
