/** Qualifying result options */
export type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'ABS';

/** Extended results for Nationals scoresheets */
export type NationalsResult = '1st' | '2nd' | '3rd' | '4th';
export type ExtendedResult = QualifyingResult | NationalsResult;

/** Area score state managed by useScoresheetScoring */
export interface AreaScore {
  areaName: string;
  time: string;
  found: boolean;
  correct: boolean;
  faultCount?: number;
}

/** Universal output from all scoresheet variants */
export interface ScoreData {
  resultText: string;
  searchTime: string;
  nonQualifyingReason?: string;
  areas: Record<string, string>;
  areaTimes: string[];
  correctCount: number;
  incorrectCount: number;
  faultCount: number;
  finishCallErrors: number;
  points: number;
  element?: string;
  level?: string;
}

/** Universal input for all scoresheet variants */
export interface ScoresheetEntry {
  id: number;
  armband: number;
  dogName: string;
  handlerName: string;
  className: string;
  element?: string;
  level?: string;
  section?: string;
  existingScore?: ScoreData;
}

/** Class info passed to scoresheets */
export interface ScoresheetClassInfo {
  element: string;
  level: string;
  section?: string;
  trialDate?: string;
  trialNumber?: string;
}

/** Sport type identifier */
export type ScoresheetSportType =
  | 'AKC_SCENT_WORK'
  | 'AKC_SCENT_WORK_NATIONAL'
  | 'AKC_FASTCAT'
  | 'UKC_NOSEWORK'
  | 'UKC_OBEDIENCE'
  | 'UKC_RALLY'
  | 'ASCA_SCENT_DETECTION';

/** Shared props for all scoresheet components */
export interface BaseScoresheetProps {
  entry: ScoresheetEntry;
  classInfo: ScoresheetClassInfo;
  rules: import('./resolvedClassRules').ResolvedClassRules;
  onSubmit: (scoreData: ScoreData) => void | Promise<void>;
  onBack: () => void;
}

/** Additional props for LiveScoresheet variants */
export interface LiveScoresheetProps extends BaseScoresheetProps {
  onWarningChime?: () => void;
  onVoiceAnnouncement?: (secondsRemaining: number) => void;
  enableVoiceAnnouncements?: boolean;
}

/** Additional props for EntryScoresheet variants */
export interface EntryScoresheetProps extends BaseScoresheetProps {
  onNext?: () => void;
}
