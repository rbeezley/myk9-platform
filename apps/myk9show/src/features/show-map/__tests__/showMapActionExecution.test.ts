import { ClipboardCheck } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { ShowMapAction } from '../showMapActions';
import { showMapActionIds } from '../showMapActions';
import {
  isShowMapActionEnabled,
  resolveShowMapActionExecution,
  showMapActionExecutionById,
} from '../showMapActionExecution';

function makeAction(
  overrides: Partial<Omit<ShowMapAction, 'href'>> & { href?: string | null } = {}
): ShowMapAction {
  const { href = '/scoring/classes/class-1/entries?mode=split', ...rest } = overrides;

  return {
    id: 'score-class',
    nodeId: 'class:class-1',
    label: 'Score Class',
    why: 'Class is in progress',
    priority: 70,
    icon: ClipboardCheck,
    ...(href === null ? {} : { href }),
    ...rest,
  };
}

describe('showMapActionExecution', () => {
  it('defines execution metadata for every Show Map action id', () => {
    expect(Object.keys(showMapActionExecutionById).sort()).toEqual([...showMapActionIds].sort());
  });

  it('keeps navigation actions executable when a destination exists', () => {
    const action = makeAction();

    expect(resolveShowMapActionExecution(action)).toEqual({
      kind: 'navigate',
      href: '/scoring/classes/class-1/entries?mode=split',
    });
    expect(isShowMapActionEnabled(action)).toBe(true);
  });

  it('disables navigation actions when the row has no destination', () => {
    const action = makeAction({ href: null });

    expect(resolveShowMapActionExecution(action)).toEqual({
      kind: 'disabled',
      futureKind: 'navigate',
      disabledReason: 'No destination is available for this action.',
    });
    expect(isShowMapActionEnabled(action)).toBe(false);
  });

  it('never resolves a navigation execution for an action without a usable href', () => {
    const navigationActionIds = showMapActionIds.filter(
      id => showMapActionExecutionById[id].kind === 'navigate'
    );

    for (const id of navigationActionIds) {
      expect(resolveShowMapActionExecution(makeAction({ id, href: null }))).toMatchObject({
        kind: 'disabled',
        disabledReason: 'No destination is available for this action.',
      });
    }
  });

  it('enables mark checked-in as the first mutation action', () => {
    const markCheckedIn = makeAction({
      id: 'mark-checked-in',
      label: 'Mark checked in',
      href: null,
    });

    expect(resolveShowMapActionExecution(markCheckedIn)).toEqual({
      kind: 'mutation',
      mutation: 'mark-checked-in',
      successMessage: 'Entry checked in',
    });
    expect(isShowMapActionEnabled(markCheckedIn)).toBe(true);
  });

  it('enables class lifecycle actions through the shared mutation lane', () => {
    const markStarted = makeAction({
      id: 'mark-class-started',
      label: 'Mark Class Started',
      href: null,
    });
    const markComplete = makeAction({
      id: 'mark-class-complete',
      label: 'Mark Class Complete',
      href: null,
    });

    expect(resolveShowMapActionExecution(markStarted)).toEqual({
      kind: 'mutation',
      mutation: 'mark-class-started',
      successMessage: 'Class marked started',
    });
    expect(resolveShowMapActionExecution(markComplete)).toEqual({
      kind: 'mutation',
      mutation: 'mark-class-complete',
      successMessage: 'Class marked complete',
    });
    expect(isShowMapActionEnabled(markStarted)).toBe(true);
    expect(isShowMapActionEnabled(markComplete)).toBe(true);
  });

  it('enables scratch / no-show through the shared dialog lane', () => {
    const scratch = makeAction({
      id: 'scratch-entry',
      label: 'Scratch / no-show',
      href: null,
    });

    expect(resolveShowMapActionExecution(scratch)).toEqual({
      kind: 'dialog',
      dialog: 'scratch-entry',
    });
    expect(isShowMapActionEnabled(scratch)).toBe(true);
  });

  it('enables move-up through the shared dialog lane', () => {
    const moveUp = makeAction({
      id: 'move-up-entry',
      label: 'Move up',
      href: null,
    });

    expect(resolveShowMapActionExecution(moveUp)).toEqual({
      kind: 'dialog',
      dialog: 'move-up-entry',
    });
    expect(isShowMapActionEnabled(moveUp)).toBe(true);
  });

  it('enables message handler through the shared dialog lane', () => {
    const messageHandler = makeAction({
      id: 'message-handler',
      label: 'Message handler',
      href: null,
    });

    expect(resolveShowMapActionExecution(messageHandler)).toEqual({
      kind: 'dialog',
      dialog: 'message-handler',
    });
    expect(isShowMapActionEnabled(messageHandler)).toBe(true);
  });
});
