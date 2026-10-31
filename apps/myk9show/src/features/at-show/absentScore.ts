import type { ScoreData } from '@myk9/scoring-ui';

/**
 * What the live scoresheet submits for its Absent chip: a zero time and the
 * "Absent" reason, nothing timed. The server's held-entry guard allows exactly
 * this write and refuses any timed or other result.
 */
export const ABSENT_SCORE: ScoreData = {
  resultText: 'ABS',
  searchTime: '0.00',
  nonQualifyingReason: 'Absent',
  areas: {},
  areaTimes: [],
  correctCount: 0,
  incorrectCount: 0,
  faultCount: 0,
  finishCallErrors: 0,
  points: 0,
};
