import { beforeEach, describe, expect, it } from 'vitest';
import { STALE_CLASS_IDLE_MS } from './detectStaleClass';
import { useStaleClassPromptStore, type StaleClassPrompt } from './staleClassPromptStore';

const NOW = 1_000_000;
const prompt = (scoredClassId: string): StaleClassPrompt => ({
  classId: 'stale',
  className: 'Buried Excellent A',
  unscoredEntryIds: ['a', 'b', 'c'],
  lastResultAtMs: 0,
  showId: 'show',
  trialId: 'trial',
  scoredClassId,
});

describe('stale-class prompt snooze', () => {
  beforeEach(() => {
    useStaleClassPromptStore.setState({ prompt: null, snoozes: {} });
  });

  it('shows the prompt when nothing is snoozed', () => {
    expect(useStaleClassPromptStore.getState().offer(prompt('x'), NOW)).toBe(true);
    expect(useStaleClassPromptStore.getState().prompt?.classId).toBe('stale');
  });

  it('"Not yet" hides it and keeps it quiet for another score in the same class', () => {
    const store = useStaleClassPromptStore.getState();
    store.offer(prompt('x'), NOW);
    store.snooze(NOW);
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
    expect(store.offer(prompt('x'), NOW + 60_000)).toBe(false);
  });

  it('asks again after a score in another class', () => {
    const store = useStaleClassPromptStore.getState();
    store.offer(prompt('x'), NOW);
    store.snooze(NOW);
    expect(store.offer(prompt('y'), NOW + 60_000)).toBe(true);
  });

  it('asks again once 15 minutes have passed', () => {
    const store = useStaleClassPromptStore.getState();
    store.offer(prompt('x'), NOW);
    store.snooze(NOW);
    expect(store.offer(prompt('x'), NOW + STALE_CLASS_IDLE_MS - 1)).toBe(false);
    expect(store.offer(prompt('x'), NOW + STALE_CLASS_IDLE_MS)).toBe(true);
  });
});
