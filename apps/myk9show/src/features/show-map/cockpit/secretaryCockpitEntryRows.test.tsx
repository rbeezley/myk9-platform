/**
 * F29b phase 1 — secretary-initiated move-up had no reachable surface.
 *
 * `ShowMapRowActionsMenu` renders the entry action set, but mounts only inside
 * `ShowMapTab` — the public show page, read-only by intent (#291). The cockpit's own
 * action surface filters to `recommended` actions via
 * `getRecommendedActionsForNode(node, …, 1)`, and no entry action sets that flag, so
 * `ShowDeskPanel`'s move-up dialog could never open.
 *
 * These tests assert the two halves that make it REACHABLE, which is the property the
 * previous two F29 verdicts both got wrong by inspecting the catalog instead:
 *
 *   1. the snapshot carries an entry row whose commandId is the exact string
 *      `ShowDeskPanel.runCommand` resolves, and
 *   2. the focused-class panel renders a control that emits it.
 *
 * See docs/plan-f29b-operational-actions-home.md.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Project convention (CLAUDE.md): the custom render wraps QueryClient, Auth and Router.
// SecretaryCockpitFocusedClass renders CockpitActionLink, which needs Router context.
import { render } from '@/test/utils/testUtils';

import { buildSecretaryCockpitSnapshot } from './buildSecretaryCockpitSnapshot';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { buildShowMapTree } from '../showMapTree';
import { getRankedActions } from '../showMapActions';

const SHOW = {
  id: 'show-1',
  name: 'Heartland',
  organization: 'AKC',
  startDate: '2026-07-20',
  endDate: '2026-07-20',
} as unknown as Parameters<typeof buildShowMapTree>[0]['show'];

const TRIALS = [
  { id: 'trial-1', showId: 'show-1', trialDate: '2026-07-20', trialNumber: '1', name: 'Trial 1' },
] as unknown as Parameters<typeof buildShowMapTree>[0]['trials'];

const CLASSES = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    classOrder: 1,
  },
] as unknown as Parameters<typeof buildShowMapTree>[0]['classes'];

const ENTRIES = [
  {
    id: 'entry-1',
    class_id: 'class-1',
    show_id: 'show-1',
    armband: '101',
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    dog: { id: 'dog-1', call_name: 'Ranger', name: 'Ranger' },
  },
] as unknown as Parameters<typeof buildShowMapTree>[0]['entries'];

function buildTree() {
  return buildShowMapTree({
    show: SHOW,
    trials: TRIALS,
    classes: CLASSES,
    entries: ENTRIES,
  });
}

function buildSnapshot() {
  const tree = buildTree();
  return {
    tree,
    snapshot: buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: TRIALS,
      classes: CLASSES,
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1/show-desk',
      now: new Date('2026-07-20T14:00:00.000Z'),
    } as unknown as Parameters<typeof buildSecretaryCockpitSnapshot>[0]),
  };
}

describe('cockpit entry rows carry the stranded actions', () => {
  it('emits a Move up commandId in the exact shape runCommand resolves', () => {
    const { tree, snapshot } = buildSnapshot();
    const cls = snapshot.classes.find(c => c.id === 'class-1');
    const row = cls?.entryRows[0];

    expect(row).toBeDefined();
    const moveUp = row?.actions.find(a => a.id === 'move-up-entry');
    expect(moveUp).toBeDefined();

    // ShowDeskPanel.runCommand does:
    //   getRankedActions('root', …).find(c => `${c.id}:${c.nodeId}` === commandId)
    // so the commandId is only useful if that lookup succeeds.
    const resolved = getRankedActions('root', { tree }).find(
      candidate => `${candidate.id}:${candidate.nodeId}` === moveUp?.commandId
    );
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('move-up-entry');
  });

  it('does not surface actions that already have a home elsewhere', () => {
    // check-in and edit-score live on SecretaryRunSheet, scratch under Entry
    // Management -> Exceptions. Re-homing them here would duplicate live surfaces.
    const { snapshot } = buildSnapshot();
    const ids = snapshot.classes.flatMap(c => c.entryRows.flatMap(r => r.actions.map(a => a.id)));

    expect(ids).toContain('move-up-entry');
    for (const elsewhere of ['mark-checked-in', 'edit-score', 'scratch-entry']) {
      expect(ids).not.toContain(elsewhere);
    }
  });

  it('renders a control that emits the commandId, and only for a manager', async () => {
    const { snapshot } = buildSnapshot();
    const model = buildSecretaryCockpitModel(snapshot, {
      selectedDay: null,
      filter: 'all',
      focusedClassId: 'class-1',
      anchor: undefined,
    } as unknown as Parameters<typeof buildSecretaryCockpitModel>[1]);

    const focused = model.focusedClass;
    expect(focused).not.toBeNull();
    const expectedCommandId = focused?.entryRows[0]?.actions[0]?.commandId;
    expect(expectedCommandId).toBeTruthy();

    const onCommand = vi.fn();
    const { unmount } = render(
      <SecretaryCockpitFocusedClass
        focused={focused}
        sourceClass={snapshot.classes[0] ?? null}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={onCommand}
      />
    );

    const button = screen.getByRole('button', { name: /Move up/i });
    await userEvent.click(button);
    expect(onCommand).toHaveBeenCalledWith(expectedCommandId);

    unmount();

    // An exhibitor-facing render must not get the manager control.
    render(
      <SecretaryCockpitFocusedClass
        focused={focused}
        sourceClass={snapshot.classes[0] ?? null}
        trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow={false}
        onCommand={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Move up/i })).toBeNull();
  });
});
