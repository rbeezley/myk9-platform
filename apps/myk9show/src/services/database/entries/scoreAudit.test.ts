import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '../databaseError';

const order = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const inFn = vi.fn();
const from = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: { from: (table: string) => from(table) },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getEntryScoreAudit, parseScoreAuditChanges } from './scoreAudit';

const auditRow = {
  id: 'a1',
  entry_id: 'entry-1',
  class_id: 'class-1',
  show_id: 'show-1',
  changed_at: '2026-11-07T16:05:00+00:00',
  changes: { is_scored: { old: false, new: true } },
  actor_user_id: 'u1',
  actor_person_id: 'p1',
  actor_display_name: 'Jo Judge',
  actor_tier: 'assigned_judge',
  passcode_role: null,
  passcode_generation: null,
  entry_version: 4,
  client_saved_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  const secondOrder = vi.fn(() => Promise.resolve({ data: [auditRow], error: null }));
  order.mockReturnValue({ order: secondOrder });
  eq.mockReturnValue({ order });
  inFn.mockResolvedValue({
    data: [{ id: 'class-1', trial: { id: 't1', timezone: 'America/Los_Angeles' } }],
    error: null,
  });
  select.mockImplementation(() => ({ eq, in: inFn }));
  from.mockImplementation(() => ({ select }));
});

describe('parseScoreAuditChanges', () => {
  it('maps the {old,new} diff and tolerates a malformed payload', () => {
    expect(parseScoreAuditChanges({ total_faults: { old: 1, new: 2 } })).toEqual([
      { field: 'total_faults', oldValue: 1, newValue: 2 },
    ]);
    expect(parseScoreAuditChanges(null)).toEqual([]);
    expect(parseScoreAuditChanges([1])).toEqual([]);
  });
});

describe('getEntryScoreAudit', () => {
  it('reads the entry rows oldest first and resolves the trial timezone', async () => {
    const items = await getEntryScoreAudit('entry-1');

    expect(from).toHaveBeenCalledWith('entry_score_audit');
    expect(eq).toHaveBeenCalledWith('entry_id', 'entry-1');
    expect(order).toHaveBeenCalledWith('changed_at', { ascending: true });
    expect(inFn).toHaveBeenCalledWith('id', ['class-1']);
    expect(items).toEqual([
      {
        id: 'a1',
        changedAt: '2026-11-07T16:05:00+00:00',
        clientSavedAt: null,
        actorName: 'Jo Judge',
        actorTier: 'assigned_judge',
        passcodeRole: null,
        changes: [{ field: 'is_scored', oldValue: false, newValue: true }],
        timeZone: 'America/Los_Angeles',
      },
    ]);
  });

  it('surfaces a read error', async () => {
    const secondOrder = vi.fn(() => Promise.resolve({ data: null, error: new Error('boom') }));
    order.mockReturnValue({ order: secondOrder });

    await expect(getEntryScoreAudit('entry-1')).rejects.toThrow('boom');
  });
});
