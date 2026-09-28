import { describe, expect, it } from 'vitest';

import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { buildCockpitScheduleViews } from './secretaryCockpitViews';
import type {
  CockpitFilter,
  SecretaryCockpitClass,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

const NOW = new Date('2026-07-20T14:42:00.000Z');
const FILTERS: readonly CockpitFilter[] = [
  'all',
  'in-progress',
  'needs-attention',
  'needs-closeout',
];

function makeClass(
  input: Partial<SecretaryCockpitClass> & Pick<SecretaryCockpitClass, 'id' | 'trialId' | 'name'>
): SecretaryCockpitClass {
  return {
    classOrder: 0,
    lifecycle: 'not-started',
    entryCount: 10,
    scoredCount: 0,
    actions: [],
    attention: [],
    paperwork: [],
    entryRows: [],
    ...input,
  };
}

/**
 * Two Classes today: `attention-winner` and `attention-loser` each carry a raw
 * attention item that collides on `dedupeKey`. `buildAttention`'s dedup keeps
 * only the first (`attention-winner`, sorted first by scheduledStart), so
 * `attention-loser`'s own `attention` array (length 1) differs from what
 * survives into `model.attention.all` for it (0). `snapshot.administrativeAttention`
 * also carries an item with no `classId` at all -- the other divergence risk
 * MYK9-812 called out (Codex P2, secretaryCockpitViews.ts:52-54).
 */
function makeSnapshot(): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    registryId: 'AKC',
    now: NOW,
    trials: [{ id: 'trial-1', date: '2026-07-20', name: 'Trial 1', number: 'Trial 1', order: 0 }],
    classes: [
      makeClass({
        id: 'attention-winner',
        trialId: 'trial-1',
        name: 'Container Novice A',
        classOrder: 0,
        scheduledStart: '09:00',
        lifecycle: 'in-progress',
        attention: [
          {
            id: 'winner:shared',
            dedupeKey: 'shared-collision',
            kind: 'blocker',
            label: 'Shared warning',
            reason: 'Collides with another Class',
            destination: { kind: 'href', href: '/entries/winner' },
          },
        ],
      }),
      makeClass({
        id: 'attention-loser',
        trialId: 'trial-1',
        name: 'Interior Novice A',
        classOrder: 1,
        scheduledStart: '10:00',
        lifecycle: 'not-started',
        closeout: 'needs-closeout',
        attention: [
          {
            id: 'loser:shared',
            dedupeKey: 'shared-collision',
            kind: 'blocker',
            label: 'Shared warning',
            reason: 'Collides with another Class',
            destination: { kind: 'href', href: '/entries/loser' },
          },
        ],
      }),
      makeClass({
        id: 'quiet',
        trialId: 'trial-1',
        name: 'Exterior Novice A',
        classOrder: 2,
        scheduledStart: '11:00',
        lifecycle: 'not-started',
      }),
    ],
    administrativeAttention: [
      {
        id: 'admin:no-class',
        kind: 'administrative',
        label: 'Show-wide notice',
        reason: 'Applies to the whole Show, not one Class',
        destination: null,
      },
    ],
  };
}

describe('buildCockpitScheduleViews tab counts', () => {
  it('matches the number of schedule rows rendered for every tab', () => {
    const snapshot = makeSnapshot();

    for (const filter of FILTERS) {
      const model = buildSecretaryCockpitModel(snapshot, { filter });
      const renderedRowCount = model.trialGroups.reduce(
        (sum, group) => sum + group.classes.length,
        0
      );

      const views = buildCockpitScheduleViews(model);
      const tabCount = views.find(view => view.id === filter)?.count;

      expect(tabCount).toBe(renderedRowCount);
    }
  });

  it("does not attribute the deduped-away Class's attention to the needs-attention tab", () => {
    const snapshot = makeSnapshot();
    const model = buildSecretaryCockpitModel(snapshot, { filter: 'all' });

    // Only `attention-winner` keeps its attention item post-dedup; the
    // administrative item has no classId, so it can never inflate this tab.
    const views = buildCockpitScheduleViews(model);
    expect(views.find(view => view.id === 'needs-attention')?.count).toBe(1);
  });
});
