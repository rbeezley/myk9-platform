/**
 * Stale-class prompt state (MYK9-1514): the one prompt on screen and the snoozes.
 *
 * "Not yet" snoozes a class until the judge's next score in ANOTHER class or 15
 * minutes, whichever comes first (owner default, plan § Decisions 4). Device-local
 * and in-memory on purpose: a reload re-asks, which is the safe direction.
 */
import { create } from 'zustand';
import { STALE_CLASS_IDLE_MS, type StaleClassCandidate } from './detectStaleClass';

export interface StaleClassPrompt extends StaleClassCandidate {
  showId: string;
  trialId: string;
  /** The class the judge had just scored in when this was offered. */
  scoredClassId: string;
}

interface Snooze {
  untilMs: number;
  scoredClassId: string;
}

interface StaleClassPromptState {
  prompt: StaleClassPrompt | null;
  snoozes: Record<string, Snooze>;
  /** Show the prompt unless this class is snoozed. Returns whether it was shown. */
  offer: (prompt: StaleClassPrompt, nowMs: number) => boolean;
  /** "Not yet". */
  snooze: (nowMs: number) => void;
  dismiss: () => void;
}

export function isSnoozed(
  snoozes: Record<string, Snooze>,
  classId: string,
  scoredClassId: string,
  nowMs: number
): boolean {
  const snooze = snoozes[classId];
  return !!snooze && snooze.scoredClassId === scoredClassId && nowMs < snooze.untilMs;
}

export const useStaleClassPromptStore = create<StaleClassPromptState>((set, get) => ({
  prompt: null,
  snoozes: {},
  offer: (prompt, nowMs) => {
    if (isSnoozed(get().snoozes, prompt.classId, prompt.scoredClassId, nowMs)) return false;
    set({ prompt });
    return true;
  },
  snooze: nowMs => {
    const { prompt, snoozes } = get();
    if (!prompt) return;
    set({
      prompt: null,
      snoozes: {
        ...snoozes,
        [prompt.classId]: {
          untilMs: nowMs + STALE_CLASS_IDLE_MS,
          scoredClassId: prompt.scoredClassId,
        },
      },
    });
  },
  dismiss: () => set({ prompt: null }),
}));
