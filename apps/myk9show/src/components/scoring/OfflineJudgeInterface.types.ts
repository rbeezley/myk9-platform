/**
 * Types for the OfflineJudgeInterface component
 */

import type { ScoringFormat } from '@/types/scoring-types';

export interface OfflineJudgeInterfaceProps {
  classId?: string;
  format?: ScoringFormat;
  onExit?: () => void;
  className?: string;
}

export interface ValidationError {
  entryId?: string;
  field?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export type JudgeView =
  | 'authentication'
  | 'setup'
  | 'entry_list'
  | 'scoring'
  | 'review'
  | 'completed';

export interface EntryWithStatus {
  id: string;
  armband: string;
  dogName: string;
  handlerName: string;
  isCompleted: boolean;
  isCurrent: boolean;
  score: unknown;
  status: string;
}

export interface JudgeCredentials {
  judgeId: string | null;
  judgeName: string | null;
  isAuthenticated: boolean;
}

export interface AuthFormState {
  judgeId: string;
  judgeName: string;
  role: 'judge';
  certifications: string[];
  authorizedFormats: ScoringFormat[];
}
