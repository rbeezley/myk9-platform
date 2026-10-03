/**
 * MYK9-976, owner decision 2026-10-03: "Move up" is hidden until an entry is
 * accepted. A pending (submitted, not yet accepted) entry such as #102 Juni is
 * not offered it anywhere; neither is a withdrawn one.
 *
 * Stored state of Exterior Excellent on the Heartland demo show: Juni pending,
 * Ranger and Maple withdrawn and refunded, plus one accepted entry.
 */
import { describe, expect, it } from 'vitest';
import { buildSecretaryCockpitSnapshot } from './buildSecretaryCockpitSnapshot';
import { buildShowMapTree } from '../showMapTree';
import { getDirectActionsForNode } from '../showMapActions';

type TreeInput = Parameters<typeof buildShowMapTree>[0];

const SHOW = {
  id: 'show-1',
  name: 'Heartland',
  organization: 'AKC',
  startDate: '2026-07-20',
  endDate: '2026-07-20',
} as unknown as TreeInput['show'];
const TRIALS = [
  { id: 'trial-1', showId: 'show-1', trialDate: '2026-07-20', trialNumber: '1', name: 'Trial 1' },
] as unknown as TreeInput['trials'];
const CLASSES = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Exterior Excellent',
    element: 'Exterior',
    level: 'Excellent',
    status: 'scheduled',
    classOrder: 1,
  },
] as unknown as TreeInput['classes'];

const entry = (id: string, armband: string | null, entryStatus: string, dog: string) => ({
  id,
  class_id: 'class-1',
  show_id: 'show-1',
  armband,
  entry_status: entryStatus,
  dog: { id: `dog-${id}`, call_name: dog, name: dog },
});
const ENTRIES = [
  entry('juni', '102', 'submitted', 'Juni'),
  entry('ranger', null, 'withdrawn', 'Ranger'),
  entry('maple', null, 'withdrawn', 'Maple'),
  entry('scout', '103', 'confirmed', 'Scout'),
] as unknown as TreeInput['entries'];

function buildTree() {
  return buildShowMapTree({
    show: SHOW,
    trials: TRIALS,
    classes: CLASSES,
    entries: ENTRIES,
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
}

function offersMoveUp(tree: ReturnType<typeof buildTree>, entryId: string): boolean {
  const node = tree.nodesById[`entry:${entryId}`]!;
  return getDirectActionsForNode(node, { tree }).some(action => action.id === 'move-up-entry');
}

describe('Move up is hidden until the entry is accepted (MYK9-976)', () => {
  it('offers it on the accepted entry only, never on pending or withdrawn ones', () => {
    const tree = buildTree();

    expect(offersMoveUp(tree, 'scout')).toBe(true);
    expect(offersMoveUp(tree, 'juni')).toBe(false);
    expect(offersMoveUp(tree, 'ranger')).toBe(false);
    expect(offersMoveUp(tree, 'maple')).toBe(false);
  });

  it('keeps the class panel entry rows to the accepted entry', () => {
    const tree = buildTree();
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: TRIALS,
      classes: CLASSES,
      tree,
      pendingSignals: [],
      returnTo: '/shows/show-1/show-day',
      now: new Date('2026-07-20T14:00:00.000Z'),
    } as unknown as Parameters<typeof buildSecretaryCockpitSnapshot>[0]);

    const rows = snapshot.classes.find(c => c.id === 'class-1')?.entryRows ?? [];

    expect(rows.map(row => row.nodeId)).toEqual(['entry:scout']);
  });

  it.each(['paid', 'pending', 'draft', 'promotion-expired'])(
    'treats %s as not yet accepted',
    status => {
      const tree = buildShowMapTree({
        show: SHOW,
        trials: TRIALS,
        classes: CLASSES,
        entries: [entry('x', '1', status, 'X')] as unknown as TreeInput['entries'],
        entryPreviewLimit: Number.POSITIVE_INFINITY,
      });

      expect(offersMoveUp(tree, 'x')).toBe(false);
    }
  );
});
