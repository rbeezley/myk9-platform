import type { WizardState } from './wizardStore';

export type CloneHydrationStatus = 'idle' | 'hydrating' | 'ready' | 'failed';

export interface CloneHydrationState {
  status: CloneHydrationStatus;
  sourceShowId: string | null;
  sourceShowName: string | null;
  /** What the clone applied, kept for the banner's summary. Set when status is 'ready'. */
  snapshot?: CloneHydrationSnapshot | undefined;
  failureReason?: 'load-failed' | undefined;
}

export interface CloneHydrationSnapshot {
  sourceShowId: string;
  sourceShowName: string;
  show: Partial<WizardState['show']>;
  judgeDetails: WizardState['judgeDetails'];
  trials: Array<Omit<WizardState['trials'][number], 'id'>>;
}
