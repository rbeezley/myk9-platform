import { describe, expect, it } from 'vitest';

import { buildClassChecklist } from './classChecklist';
import { classStepAccessibleName, resolveClassStepAction } from './classStepActions';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const sheet = (reportId: string, printHref?: string): SecretaryCockpitPaperwork => ({
  reportId,
  label: reportId,
  state: 'unconfirmed',
  ...(printHref ? { printHref } : {}),
});
const context = (paperwork: SecretaryCockpitPaperwork[], canManageShow = true) => ({
  paperwork,
  canManageShow,
  scoringHref: '/scoring/c1',
  resultsHref: '/results/c1',
});
const itemsFor = (paperwork: SecretaryCockpitPaperwork[]) =>
  buildClassChecklist({
    lifecycle: 'in-progress',
    entryCount: 4,
    scoredCount: 1,
    registryId: 'AKC',
    paperwork,
  });

describe('resolveClassStepAction', () => {
  const paperwork = ['check-in-sheet', 'scoresheet', 'results-sheet', 'result-labels'].map(id =>
    sheet(id, `/print/${id}`)
  );
  const byId = (id: string, ctx = context(paperwork)) =>
    resolveClassStepAction(
      itemsFor(paperwork).find(item => item.id === id)!,
      ctx
    );

  it.each(['check-in-sheet', 'scoresheet', 'results-sheet', 'result-labels'])(
    'opens the print preview for %s with just that report',
    id => {
      expect(byId(id)).toEqual({ kind: 'print', reportId: id, label: 'Open print preview' });
    }
  );

  it('opens the start editor only for someone who can manage the show', () => {
    expect(byId('class-started')).toMatchObject({ kind: 'editor' });
    expect(byId('class-started', context(paperwork, false))).toBeNull();
  });

  it('links scoring to paper scoring and the signature to Results', () => {
    expect(byId('scoring-complete')).toMatchObject({ kind: 'link', href: '/scoring/c1' });
    expect(byId('judge-signature')).toMatchObject({ kind: 'link', href: '/results/c1' });
  });

  it('is plain status for a sheet with no print link', () => {
    const bare = [sheet('scoresheet')];
    const item = itemsFor(bare).find(entry => entry.id === 'scoresheet')!;
    expect(resolveClassStepAction(item, context(bare))).toBeNull();
  });
});

describe('classStepAccessibleName', () => {
  it('names the label, the state and the action', () => {
    const paperwork = [{ ...sheet('scoresheet', '/p'), state: 'stale' as const }];
    const item = itemsFor(paperwork).find(entry => entry.id === 'scoresheet')!;
    const action = resolveClassStepAction(item, context(paperwork));
    expect(classStepAccessibleName(item, action)).toBe(
      'Score sheets, needs reprint. Open print preview'
    );
    expect(classStepAccessibleName(item, null)).toBe('Score sheets, needs reprint');
  });
});
