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

  it('keeps remaining planned action work disabled behind explicit reasons', () => {
    const moveUp = makeAction({
      id: 'move-up-entry',
      label: 'Move up',
      href: null,
    });
    const scratch = makeAction({
      id: 'scratch-entry',
      label: 'Scratch / no-show',
      href: null,
    });
    const messageHandler = makeAction({
      id: 'message-handler',
      label: 'Message handler',
      href: null,
    });

    expect(resolveShowMapActionExecution(moveUp)).toMatchObject({
      kind: 'disabled',
      futureKind: 'dialog',
      disabledReason: expect.stringContaining('Move-Ups'),
    });
    expect(resolveShowMapActionExecution(scratch)).toMatchObject({
      kind: 'disabled',
      futureKind: 'dialog',
      disabledReason: expect.stringContaining('Pulled'),
    });
    expect(resolveShowMapActionExecution(messageHandler)).toMatchObject({
      kind: 'disabled',
      futureKind: 'dialog',
      disabledReason: expect.stringContaining('Messages'),
    });
  });
});
