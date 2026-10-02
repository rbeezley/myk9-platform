import { describe, expect, it } from 'vitest';
import { SHOW_MAP_WRAP_UP_STATUS } from '../../showMapTypes';
import {
  buildClassChecklist,
  summarizeClassChecklist,
  type ClassChecklistInput,
} from '../classChecklist';
import type { PaperworkState, SecretaryCockpitPaperwork } from '../secretaryCockpitTypes';

function paper(reportId: string, state: PaperworkState): SecretaryCockpitPaperwork {
  return { reportId, label: reportId, state, printHref: `/print/${reportId}` };
}

const NOT_STARTED: ClassChecklistInput = {
  lifecycle: 'not-started',
  entryCount: 4,
  scoredCount: 0,
  wrapUpStatus: null,
  paperwork: [
    paper('check-in-sheet', 'unconfirmed'),
    paper('scoresheet', 'unconfirmed'),
    paper('results-sheet', 'unconfirmed'),
    paper('armband-labels', 'unconfirmed'),
    paper('result-labels', 'unconfirmed'),
  ],
};

function states(input: ClassChecklistInput) {
  return Object.fromEntries(buildClassChecklist(input).map(item => [item.id, item.state]));
}

describe('buildClassChecklist', () => {
  it('lists the seven items in show order, with the owner-facing labels', () => {
    expect(buildClassChecklist(NOT_STARTED).map(item => [item.id, item.label])).toEqual([
      ['check-in-sheet', 'Check-in sheet'],
      ['scoresheet', 'Score sheets'],
      ['class-started', 'Class started'],
      ['scoring-complete', 'Scoring complete'],
      ['results-sheet', 'Preliminary results'],
      ['result-labels', 'Ribbon labels'],
      ['judge-signature', 'Judge signature collected'],
    ]);
  });

  it('leaves armband labels out of the checklist', () => {
    const items = buildClassChecklist(NOT_STARTED);
    expect(items.map(item => item.paperwork?.reportId)).not.toContain('armband-labels');
  });

  it('reads print state from paperwork: current is done, stale needs a reprint', () => {
    const result = states({
      ...NOT_STARTED,
      paperwork: [
        paper('check-in-sheet', 'current'),
        paper('scoresheet', 'stale'),
        paper('results-sheet', 'unconfirmed'),
        paper('result-labels', 'unknown'),
      ],
    });
    expect(result['check-in-sheet']).toBe('done');
    expect(result.scoresheet).toBe('reprint');
    expect(result['results-sheet']).toBe('todo');
    expect(result['result-labels']).toBe('unknown');
  });

  it('keeps the paperwork row on print items so print and Mark printed stay available', () => {
    const item = buildClassChecklist(NOT_STARTED).find(entry => entry.id === 'check-in-sheet');
    expect(item?.paperwork?.printHref).toBe('/print/check-in-sheet');
  });

  it('treats a report with nothing to print yet as not done, without a paperwork row', () => {
    const item = buildClassChecklist({ ...NOT_STARTED, paperwork: [] }).find(
      entry => entry.id === 'results-sheet'
    );
    expect(item?.state).toBe('todo');
    expect(item?.detail).toBe('Nothing to print yet');
    expect(item?.paperwork).toBeUndefined();
  });

  it('marks nothing done for a class that has not started', () => {
    const result = states(NOT_STARTED);
    expect(result['class-started']).toBe('todo');
    expect(result['scoring-complete']).toBe('todo');
    expect(result['judge-signature']).toBe('todo');
  });

  it('shows scoring progress while a class is running', () => {
    const items = buildClassChecklist({
      ...NOT_STARTED,
      lifecycle: 'in-progress',
      scoredCount: 1,
    });
    expect(items.find(item => item.id === 'class-started')?.state).toBe('done');
    const scoring = items.find(item => item.id === 'scoring-complete');
    expect(scoring?.state).toBe('todo');
    expect(scoring?.detail).toBe('1 of 4 scored');
  });

  it('reads scoring complete and the signature from the wrap-up status', () => {
    const needsSignature = states({
      ...NOT_STARTED,
      lifecycle: 'complete',
      scoredCount: 4,
      wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
    });
    expect(needsSignature['scoring-complete']).toBe('done');
    expect(needsSignature['judge-signature']).toBe('todo');

    for (const signed of [
      SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
      SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY,
      SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
    ]) {
      expect(states({ ...NOT_STARTED, lifecycle: 'complete', wrapUpStatus: signed })).toMatchObject(
        { 'scoring-complete': 'done', 'judge-signature': 'done' }
      );
    }
  });

  it('counts a fully scored class as started even if its status was never moved', () => {
    expect(
      states({
        ...NOT_STARTED,
        scoredCount: 4,
        wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
      })['class-started']
    ).toBe('done');
  });

  it('says unknown, never done or not done, when counts or status cannot be read', () => {
    const result = states({
      ...NOT_STARTED,
      lifecycle: null,
      entryCount: null,
      scoredCount: null,
    });
    expect(result['class-started']).toBe('unknown');
    expect(result['scoring-complete']).toBe('unknown');
    expect(result['judge-signature']).toBe('unknown');
  });

  it('is empty for a cancelled class', () => {
    expect(buildClassChecklist({ ...NOT_STARTED, lifecycle: 'cancelled' })).toEqual([]);
  });

  it('lets items complete in any order', () => {
    const result = states({
      ...NOT_STARTED,
      paperwork: [paper('results-sheet', 'current'), paper('result-labels', 'current')],
    });
    expect(result['results-sheet']).toBe('done');
    expect(result['result-labels']).toBe('done');
    expect(result['class-started']).toBe('todo');
  });
});

describe('summarizeClassChecklist', () => {
  it('counts done and unknown items; a reprint is not done', () => {
    const items = buildClassChecklist({
      ...NOT_STARTED,
      lifecycle: 'in-progress',
      paperwork: [
        paper('check-in-sheet', 'current'),
        paper('scoresheet', 'stale'),
        paper('result-labels', 'unknown'),
      ],
    });
    expect(summarizeClassChecklist(items)).toEqual({ done: 2, total: 7, unknown: 1 });
  });
});
