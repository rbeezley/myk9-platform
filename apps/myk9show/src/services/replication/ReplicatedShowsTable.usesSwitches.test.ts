import { describe, expect, it, vi } from 'vitest';
import { ReplicatedShowsTable, rowToShow, type ReplicatedShow } from './ReplicatedShowsTable';

/**
 * MYK9-1685: the five "This show uses…" switches round-trip through the replica row and the
 * queued UPDATE payload, so a flip made offline syncs the right column.
 */
const base = {
  id: 'show-1',
  name: 'Spring Specialty',
  organization: 'AKC',
  startDate: '2026-12-01',
  endDate: '2026-12-02',
} as ReplicatedShow;

const FIELDS = [
  ['usesDeviceScoring', 'uses_device_scoring'],
  ['usesPaperPacket', 'uses_paper_packet'],
  ['usesVolunteers', 'uses_volunteers'],
  ['usesLandingPage', 'uses_landing_page'],
  ['publishesOwnPremium', 'publishes_own_premium'],
] as const;

function tableWith(current: ReplicatedShow) {
  const table = new ReplicatedShowsTable();
  const internals = table as unknown as {
    get(id: string): Promise<ReplicatedShow | null>;
    writeAndQueue(
      id: string,
      row: ReplicatedShow,
      mutation: { payload: Record<string, unknown> }
    ): Promise<{ mutationId: string }>;
  };
  vi.spyOn(internals, 'get').mockResolvedValue(current);
  const write = vi.spyOn(internals, 'writeAndQueue').mockResolvedValue({ mutationId: 'm1' });
  return { table, write };
}

describe('ReplicatedShowsTable "This show uses…" fields (MYK9-1685)', () => {
  it.each(FIELDS)('rowToShow reads %s from %s', (field, column) => {
    const show = rowToShow({ ...base, id: 'show-1', [column]: true } as never);
    expect(show[field]).toBe(true);
  });

  it.each(FIELDS)(
    'updateShow sends %s as %s and nothing else of the five',
    async (field, column) => {
      const { table, write } = tableWith(base);

      await table.updateShow('show-1', { [field]: true });

      const payload = write.mock.calls[0]![2].payload;
      expect(payload[column]).toBe(true);
      for (const [, other] of FIELDS)
        if (other !== column) expect(payload).not.toHaveProperty(other);
    }
  );

  it('an unrelated edit does not carry a cached copy of the switches', async () => {
    const { table, write } = tableWith({ ...base, usesVolunteers: true, usesDeviceScoring: false });

    await table.updateShow('show-1', { latitude: 1, longitude: 2 });

    const payload = write.mock.calls[0]![2].payload;
    for (const [, column] of FIELDS) expect(payload).not.toHaveProperty(column);
  });
});
