/** Shared handoff event builders for the scripts/cloud tests (MYK9-1397). */
import { makeEventId, type HandoffEvent } from './handoff.ts';

export const HEAD = 'a'.repeat(40);
export const NEW_HEAD = 'b'.repeat(40);
export const BASE = 'c'.repeat(40);

export function event(overrides: Partial<HandoffEvent> = {}): HandoffEvent {
  const draft: Omit<HandoffEvent, 'eventId'> = {
    version: 1,
    runId: 'run-1',
    parentEventId: null,
    issue: 'MYK9-1397',
    pr: 3300,
    branch: 'claude/myk9-1397-cloud-setup-handoffs',
    baseSha: BASE,
    headSha: HEAD,
    authorHarness: 'claude',
    reviewerHarness: 'codex',
    ownerUrl: 'https://claude.ai/code/session_x',
    phase: 'implementing',
    result: 'pending',
    evidence: [],
    unmetCriteria: [],
    nextAction: 'finish Stage 1',
    ...overrides,
  };
  return { ...draft, eventId: overrides.eventId ?? makeEventId(draft) };
}

/** A chain of events, each the child of the one before. */
export function chain(...steps: Partial<HandoffEvent>[]): HandoffEvent[] {
  const events: HandoffEvent[] = [];
  for (const step of steps) {
    events.push(event({ parentEventId: events.at(-1)?.eventId ?? null, ...step }));
  }
  return events;
}
