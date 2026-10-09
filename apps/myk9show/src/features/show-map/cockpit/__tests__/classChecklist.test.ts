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
      ['judge-signature', "Judge's initials collected"],
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

  it('links preliminary results and ribbon labels to Results and keeps the pre-scoring items as they were (MYK9-1032)', () => {
    const items = buildClassChecklist({
      ...NOT_STARTED,
      resultsHref: '/shows/s/results?classId=c',
    });
    const byId = Object.fromEntries(items.map(item => [item.id, item]));
    for (const id of ['results-sheet', 'result-labels']) {
      expect(byId[id]?.href).toBe('/shows/s/results?classId=c');
      expect(byId[id]?.paperwork).toBeUndefined();
      expect(byId[id]?.command).toBeUndefined();
    }
    for (const id of ['check-in-sheet', 'scoresheet', 'class-started', 'scoring-complete']) {
      expect(byId[id]?.href).toBeUndefined();
    }
    // Deferred to MYK9-1031 part 2: Results has no judge sign-off slot yet, so initials stay put.
    expect(byId['judge-signature']?.href).toBeUndefined();
    expect(byId['check-in-sheet']?.paperwork).toBeDefined();
    expect(byId.scoresheet?.paperwork).toBeDefined();
  });

  it('keeps the status of a linked print item from its print record', () => {
    const items = buildClassChecklist({
      ...NOT_STARTED,
      resultsHref: '/r',
      paperwork: [paper('results-sheet', 'current'), paper('result-labels', 'stale')],
    });
    expect(items.find(item => item.id === 'results-sheet')?.state).toBe('done');
    expect(items.find(item => item.id === 'result-labels')?.state).toBe('reprint');
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

  it('says unknown, not "Nothing to print yet" or "signed", when entries cannot be read', () => {
    // Show Day nulls both counts when its entries read is paused or empty-without-error; the
    // tree then sees zero entries, so no paperwork rows exist and a Complete class classifies
    // as ready-for-wrap-up ("no entry needed a signature") -- neither is a fact.
    const items = buildClassChecklist({
      lifecycle: 'complete',
      entryCount: null,
      scoredCount: null,
      wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
      paperwork: [],
    });
    const byId = Object.fromEntries(items.map(item => [item.id, item]));
    for (const id of ['check-in-sheet', 'scoresheet', 'results-sheet', 'result-labels']) {
      expect(byId[id]?.state).toBe('unknown');
      expect(byId[id]?.detail).toBeUndefined();
    }
    expect(byId['judge-signature']?.state).toBe('unknown');
  });

  it('says why the signature is done when no entry needed one', () => {
    const signature = buildClassChecklist({
      ...NOT_STARTED,
      lifecycle: 'complete',
      entryCount: 0,
      scoredCount: 0,
      wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
    }).find(item => item.id === 'judge-signature');
    expect(signature?.state).toBe('done');
    expect(signature?.detail).toBe('No entries to initial');
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
    expect(summarizeClassChecklist(items)).toEqual({
      done: 2,
      total: 7,
      unknown: 1,
      // In checklist order, for the schedule row's squares.
      states: ['done', 'reprint', 'done', 'todo', 'todo', 'unknown', 'todo'],
    });
  });
});
