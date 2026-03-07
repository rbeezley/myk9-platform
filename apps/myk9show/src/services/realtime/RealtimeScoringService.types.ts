import type { Score } from '@/types/scoring-types';

export interface RealtimeScorePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Score | null;
  old: Score | null;
}

export interface PresenceState {
  judgeId: string;
  judgeName: string;
  classId: string;
  lastActivity: Date;
  status: 'active' | 'idle' | 'offline';
}

export interface RealtimeConfig {
  throttleMs: number;
  debounceMs: number;
  reconnectAttempts: number;
  reconnectDelay: number;
}
