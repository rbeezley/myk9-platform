import type { ClassStatusValue } from '@myk9/core';

export interface Trial {
  id: string;
  showId: string;
  showName: string;
  trialDate: string;
  trialNumber: string;
  status: ClassStatusValue;
  image?: string | undefined;
  plannedStartTime?: string | undefined;
  timeStarted?: string | undefined;
  timeEnded?: string | undefined;
  eventNumber?: string | undefined;
  type?: string | undefined;
  order?: string | undefined;
  name?: string | undefined;
  trialType?: string | undefined;
  pipelineStage?: number | undefined;
}

export interface TrialClass {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string | undefined;
  startTime: string;
  status: ClassStatusValue;
  entries: number;
  completedEntries?: number;
  // Pipeline workflow flags (secretary review/publish flow)
  isScoringFinalized?: boolean | undefined;
  isResultsReviewed?: boolean | undefined;
  // Optional fields for enhanced class cards
  lastResultAt?: string | undefined;
  timeLimits?: string[] | undefined;
  resultsVisibility?: 'immediate' | 'after_class' | 'after_review' | undefined;
  checkInMode?: 'self' | 'table' | undefined;
  isOfflineScoring?: boolean | undefined;
}

export interface TrialFormData extends Omit<Trial, 'id' | 'image'> {
  tempImage?: string | undefined;
}
