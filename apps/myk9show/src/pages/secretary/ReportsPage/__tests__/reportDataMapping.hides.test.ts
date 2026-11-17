import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { buildEmergencyPacketData } from '../buildPacketData';
import { mapReplicatedClassToDbRow } from '@/services/mappers/classMappers';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

// MYK9-2108: a replica-backed class reaches the scoresheet only through
// `mapReplicatedClassToDbRow`, which used to drop both counts.
describe('buildEmergencyPacketData with a replica-backed class', () => {
  it('hands the renderer the class hides and distractions', () => {
    const classRow = mapReplicatedClassToDbRow(
      fromAny<Parameters<typeof mapReplicatedClassToDbRow>[0], unknown>({
        id: 'c1',
        trialId: 't1',
        name: 'Buried Master',
        element: 'Buried',
        level: 'Master',
        hideCount: 4,
        distractionCount: 2,
      })
    );

    const packet = buildEmergencyPacketData({
      show: fromAny<Show, unknown>({ id: 's1', name: 'Spring Show', startDate: '2026-06-05' }),
      trials: [fromAny<DbTrial, unknown>({ id: 't1', date: '2026-06-05', trial_number: 1 })],
      classes: [classRow as unknown as DbClass],
      entries: [],
    });

    expect(packet.classes[0]).toMatchObject({ numHides: 4, distractionCount: 2 });
  });
});
