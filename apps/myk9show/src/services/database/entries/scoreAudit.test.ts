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

import { getEntryScoreAudit, getFileScoreChangesSince, parseScoreAuditChanges } from './scoreAudit';

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

describe('getFileScoreChangesSince', () => {
  const page = (rows: Array<{ class_id: string; changed_at: string; changes: unknown }>) => {
    const range = vi.fn(() => Promise.resolve({ data: rows, error: null }));
    const orderFn = vi.fn(() => ({ range }));
    const gt = vi.fn(() => ({ order: orderFn }));
    eq.mockReturnValue({ gt });
    select.mockImplementation(() => ({ eq }));
    return { gt, orderFn };
  };

  it('reads only class, time and changes for the show, after the send, newest first', async () => {
    const { gt, orderFn } = page([]);
    await getFileScoreChangesSince('show-1', '2026-11-14T19:40:00Z');
    expect(select).toHaveBeenCalledWith('class_id, changed_at, changes');
    expect(eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(gt).toHaveBeenCalledWith('changed_at', '2026-11-14T19:40:00Z');
    expect(orderFn).toHaveBeenCalledWith('changed_at', { ascending: false });
  });

  it('keeps the newest change per class among columns the file carries', async () => {
    page([
      { class_id: 'c1', changed_at: '2026-11-14T22:00:00Z', changes: { result_status: {} } },
      { class_id: 'c1', changed_at: '2026-11-14T21:00:00Z', changes: { final_placement: {} } },
      { class_id: 'c2', changed_at: '2026-11-14T20:00:00Z', changes: { search_time_seconds: {} } },
    ]);
    const latest = await getFileScoreChangesSince('show-1', '2026-11-14T19:40:00Z');
    expect(Object.fromEntries(latest)).toEqual({
      c1: '2026-11-14T22:00:00Z',
      c2: '2026-11-14T20:00:00Z',
    });
  });

  it('ignores a change that touches only notes, signatures or video review', async () => {
    page([
      {
        class_id: 'c1',
        changed_at: '2026-11-14T22:00:00Z',
        changes: {
          judge_notes: {},
          judge_signature: {},
          has_video_review: {},
          video_review_notes: {},
        },
      },
      { class_id: 'c1', changed_at: '2026-11-14T21:00:00Z', changes: { scoring_started_at: {} } },
    ]);
    expect((await getFileScoreChangesSince('show-1', '2026-11-14T19:40:00Z')).size).toBe(0);
  });
});
