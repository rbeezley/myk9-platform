/**
 * ReplicatedJudgeAssignmentsTable Tests
 *
 * Validates offline-first judge assignment data replication:
 * - Constructor initialization
 * - CRUD operations
 * - Filtering by show and person
 * - Data transformation (snake_case ↔ camelCase)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ReplicatedJudgeAssignmentsTable,
  rowToJudgeAssignment,
  type ReplicatedJudgeAssignment,
} from '../ReplicatedJudgeAssignmentsTable';

/** Denormalized snapshot fields default to null on a non-enriched fixture. */
const NULL_ENRICHMENT = {
  className: null,
  classElement: null,
  classLevel: null,
  classStatus: null,
  classStartTime: null,
  classScoredCount: null,
  classCheckedInCount: null,
  classTotalEntries: null,
  trialDate: null,
  trialTimezone: null,
} as const;

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        gt: vi.fn(() => ({
          order: vi.fn(() => ({
            eq: vi.fn(() => ({})),
          })),
        })),
        is: vi.fn(() => ({
          gt: vi.fn(() => ({
            order: vi.fn(() => ({})),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ReplicatedJudgeAssignmentsTable', () => {
  let table: ReplicatedJudgeAssignmentsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedJudgeAssignmentsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  describe('rebuildUpdatePayload day_capacity_override', () => {
    const baseAssignment: ReplicatedJudgeAssignment = {
      id: 'ja-1',
      personId: 'person-1',
      showId: 'show-1',
      trialId: null,
      classId: null,
      status: 'confirmed',
      invitedAt: '2026-03-01T00:00:00Z',
      confirmedAt: '2026-03-02T00:00:00Z',
      fee: 150.0,
      notes: 'Scent work specialist',
      ...NULL_ENRICHMENT,
    };

    function rebuild(assignment: ReplicatedJudgeAssignment): Record<string, unknown> {
      return (
        table as unknown as {
          rebuildUpdatePayload: (a: ReplicatedJudgeAssignment) => Record<string, unknown>;
        }
      ).rebuildUpdatePayload(assignment);
    }

    it('omits day_capacity_override when the field is undefined (pre-migration cached row)', () => {
      const assignment = { ...baseAssignment };
      delete (assignment as { dayCapacityOverride?: number | null }).dayCapacityOverride;

      const payload = rebuild(assignment);

      expect(payload).not.toHaveProperty('day_capacity_override');
    });

    it('sends explicit null when the caller deliberately clears the override', () => {
      const assignment: ReplicatedJudgeAssignment = {
        ...baseAssignment,
        dayCapacityOverride: null,
      };

      const payload = rebuild(assignment);

      expect(payload).toHaveProperty('day_capacity_override', null);
    });

    it('sends the numeric override when set', () => {
      const assignment: ReplicatedJudgeAssignment = { ...baseAssignment, dayCapacityOverride: 3 };

      const payload = rebuild(assignment);

      expect(payload).toHaveProperty('day_capacity_override', 3);
    });
  });

  describe('Constructor', () => {
    it('should initialize with table name "judge_assignments"', () => {
      expect(table.getTableName()).toBe('judge_assignments');
    });

    it('should be an instance of ReplicatedJudgeAssignmentsTable', () => {
      expect(table).toBeInstanceOf(ReplicatedJudgeAssignmentsTable);
    });
  });

  describe('CRUD Operations', () => {
    const baseAssignment: ReplicatedJudgeAssignment = {
      id: 'ja-1',
      personId: 'person-1',
      showId: 'show-1',
      trialId: null,
      classId: null,
      status: 'confirmed',
      invitedAt: '2026-03-01T00:00:00Z',
      confirmedAt: '2026-03-02T00:00:00Z',
      fee: 150.0,
      notes: 'Scent work specialist',
      ...NULL_ENRICHMENT,
    };

    it('should store and retrieve an assignment', async () => {
      await table.set('ja-1', baseAssignment);
      const result = await table.get('ja-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('ja-1');
      expect(result?.personId).toBe('person-1');
      expect(result?.showId).toBe('show-1');
      expect(result?.status).toBe('confirmed');
      expect(result?.fee).toBe(150.0);
    });

    it('redacts private fields from collection reads for stale offline rows', async () => {
      await table.set('ja-1', baseAssignment);

      const result = await table.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].fee).toBeNull();
      expect(result[0].notes).toBeNull();
    });

    it('redacts private fields from status-bearing collection reads', async () => {
      await table.set('ja-1', baseAssignment);

      const result = await table.getAllWithStatus();

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected a successful local read');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].fee).toBeNull();
      expect(result.rows[0].notes).toBeNull();
    });

    it('should return null for non-existent assignment', async () => {
      const result = await table.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle null fields correctly', async () => {
      const nullAssignment: ReplicatedJudgeAssignment = {
        id: 'ja-2',
        personId: 'person-2',
        showId: null,
        trialId: null,
        classId: null,
        status: null,
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      };

      await table.set('ja-2', nullAssignment);
      const result = await table.get('ja-2');

      expect(result?.showId).toBeNull();
      expect(result?.status).toBeNull();
      expect(result?.fee).toBeNull();
      expect(result?.notes).toBeNull();
    });
  });

  describe('getByShowId', () => {
    beforeEach(async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'person-1',
        showId: 'show-1',
        trialId: null,
        classId: null,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });
      await table.set('ja-2', {
        id: 'ja-2',
        personId: 'person-2',
        showId: 'show-1',
        trialId: null,
        classId: null,
        status: 'invited',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });
      await table.set('ja-3', {
        id: 'ja-3',
        personId: 'person-1',
        showId: 'show-2',
        trialId: null,
        classId: null,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });
    });

    it('should return only assignments for the given showId', async () => {
      const result = await table.getByShowId('show-1');
      expect(result).toHaveLength(2);
      expect(result.every(a => a.showId === 'show-1')).toBe(true);
    });

    it('should return empty array for show with no assignments', async () => {
      const result = await table.getByShowId('show-999');
      expect(result).toHaveLength(0);
    });
  });

  describe('getByPersonId', () => {
    beforeEach(async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'person-1',
        showId: 'show-1',
        trialId: null,
        classId: null,
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });
      await table.set('ja-2', {
        id: 'ja-2',
        personId: 'person-2',
        showId: 'show-1',
        trialId: null,
        classId: null,
        status: 'invited',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });
    });

    it('should return only assignments for the given personId', async () => {
      const result = await table.getByPersonId('person-1');
      expect(result).toHaveLength(1);
      expect(result[0].personId).toBe('person-1');
    });

    it('should return empty array for person with no assignments', async () => {
      const result = await table.getByPersonId('person-999');
      expect(result).toHaveLength(0);
    });
  });

  // D3: the writer functions in judges/reads.ts route through these methods
  // instead of raw untypedFrom('judge_assignments') writes.
  // MYK9-772: a show-level judge edit is applied as a difference, never as
  // "replace every show-level row" — which deleted real judges when the form
  // had loaded an empty list from a failed device read.
  describe('applyShowLevelJudgeChanges', () => {
    const row = (id: string, personId: string, classId: string | null) => ({
      id,
      personId,
      showId: 'show-1',
      trialId: null,
      classId,
      status: 'confirmed' as const,
      invitedAt: null,
      confirmedAt: null,
      fee: null,
      notes: null,
      ...NULL_ENRICHMENT,
    });

    beforeEach(async () => {
      await table.set('ja-a', row('ja-a', 'judge-a', null));
      await table.set('ja-b', row('ja-b', 'judge-b', null));
      await table.set('ja-class', row('ja-class', 'judge-class', 'class-1'));
    });

    const showLevelJudges = async () =>
      (await table.getByShowId('show-1'))
        .filter(a => a.classId === null)
        .map(a => a.personId)
        .sort();

    it('adds without touching the judges it was not told to remove', async () => {
      await table.applyShowLevelJudgeChanges('show-1', { add: ['judge-c'], remove: [] });
      expect(await showLevelJudges()).toEqual(['judge-a', 'judge-b', 'judge-c']);
    });

    it('removes only the named judges, and never class-level rows', async () => {
      await table.applyShowLevelJudgeChanges('show-1', {
        add: [],
        remove: ['judge-a', 'judge-class'],
      });
      expect(await showLevelJudges()).toEqual(['judge-b']);
      expect(await table.get('ja-class')).not.toBeNull();
    });

    it('does not duplicate a judge who already has a show-level row', async () => {
      const create = vi.spyOn(table, 'createAssignment');
      await table.applyShowLevelJudgeChanges('show-1', { add: ['judge-a'], remove: [] });
      expect(create).not.toHaveBeenCalled();
    });

    it('writes nothing, and reads nothing, for an empty change', async () => {
      const read = vi.spyOn(table, 'getAllWithStatus');
      await table.applyShowLevelJudgeChanges('show-1', { add: [], remove: [] });
      expect(read).not.toHaveBeenCalled();
    });

    it('refuses to write when the existing rows cannot be read', async () => {
      vi.spyOn(table, 'getAllWithStatus').mockResolvedValue({
        ok: false,
        rows: [],
        error: new Error('IndexedDB read timed out'),
      });
      const create = vi.spyOn(table, 'createAssignment');
      const remove = vi.spyOn(table, 'deleteAssignment');
      await expect(
        table.applyShowLevelJudgeChanges('show-1', { add: ['judge-c'], remove: ['judge-a'] })
      ).rejects.toThrow(/Could not read this show's judge assignments/);
      expect(create).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });
  });

  // MYK9-769 (review): the class-level writes had the same swallowed read.
  describe('class-level writes on a failed device read', () => {
    beforeEach(() => {
      vi.spyOn(table, 'getAllWithStatus').mockResolvedValue({
        ok: false,
        rows: [],
        error: new Error('IndexedDB read timed out'),
      });
    });

    it('replaceClassAssignment refuses rather than adding a second judge', async () => {
      const create = vi.spyOn(table, 'createAssignment');
      await expect(table.replaceClassAssignment('show-1', 'class-1', 'judge-2')).rejects.toThrow(
        /Could not read this show's judge assignments/
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('reassignClassAssignment fails instead of reporting a no-op success', async () => {
      const update = vi.spyOn(table, 'updateAssignment');
      await expect(
        table.reassignClassAssignment('show-1', 'class-1', 'judge-1', 'judge-2')
      ).rejects.toThrow(/Could not read this show's judge assignments/);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('replaceClassAssignment', () => {
    it('removes the old class assignment and creates the new one', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-old',
        showId: 'show-1',
        trialId: null,
        classId: 'class-1',
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });

      await table.replaceClassAssignment('show-1', 'class-1', 'judge-new');

      expect(await table.get('ja-1')).toBeNull();
      const all = await table.getByShowId('show-1');
      expect(all).toHaveLength(1);
      expect(all[0].personId).toBe('judge-new');
      expect(all[0].classId).toBe('class-1');
    });

    it('removes the assignment without creating a replacement when judgeId is null', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-old',
        showId: 'show-1',
        trialId: null,
        classId: 'class-1',
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });

      await table.replaceClassAssignment('show-1', 'class-1', null);

      expect(await table.getByShowId('show-1')).toHaveLength(0);
    });
  });

  describe('reassignClassAssignment', () => {
    it('updates the matching row in place instead of delete+insert', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-from',
        showId: 'show-1',
        trialId: null,
        classId: 'class-1',
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });

      await table.reassignClassAssignment('show-1', 'class-1', 'judge-from', 'judge-to');

      const result = await table.get('ja-1');
      expect(result?.personId).toBe('judge-to');
    });

    it('no-ops when no local row matches the from-judge/class/show filter', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-from',
        showId: 'show-1',
        trialId: null,
        classId: 'class-1',
        status: 'confirmed',
        invitedAt: null,
        confirmedAt: null,
        fee: null,
        notes: null,
        ...NULL_ENRICHMENT,
      });

      await table.reassignClassAssignment('show-1', 'class-1', 'judge-nonexistent', 'judge-to');

      const result = await table.get('ja-1');
      expect(result?.personId).toBe('judge-from');
    });
  });

  // Sync-time denormalization: the join snapshot must land on the row so the
  // globally-synced assignment is self-sufficient for the offline dashboard.
  describe('rowToJudgeAssignment (denormalization at sync)', () => {
    const joinedRow = {
      id: 'ja-1',
      person_id: 'person-1',
      show_id: 'show-1',
      trial_id: 'trial-1',
      class_id: 'class-1',
      status: 'confirmed',
      invited_at: null,
      confirmed_at: null,
      fee: null,
      notes: null,
      classes: {
        name: 'Interior Excellent',
        element: 'Interior',
        level: 'Excellent',
        status: 'in_progress',
        start_time: '10:30:00',
        scored_count: 7,
        total_entries_count: 18,
        trial_id: 'trial-1',
        trials: { date: '2026-06-12', timezone: 'America/Chicago', show_id: 'show-1' },
      },
    } as Parameters<typeof rowToJudgeAssignment>[0];

    it('embeds the class/trial snapshot onto the assignment row', () => {
      const mapped = rowToJudgeAssignment(joinedRow);
      expect(mapped).toMatchObject({
        id: 'ja-1',
        className: 'Interior Excellent',
        classElement: 'Interior',
        classLevel: 'Excellent',
        classStatus: 'in_progress',
        classStartTime: '10:30:00',
        classScoredCount: 7,
        classTotalEntries: 18,
        trialDate: '2026-06-12',
        trialTimezone: 'America/Chicago',
      });
    });

    it('falls back to the embedded trial show_id when the assignment show_id is null', () => {
      const mapped = rowToJudgeAssignment({ ...joinedRow, show_id: null });
      expect(mapped.showId).toBe('show-1');
    });

    it('leaves enrichment null when no class is embedded (show-level assignment)', () => {
      const mapped = rowToJudgeAssignment({ ...joinedRow, classes: null });
      expect(mapped.className).toBeNull();
      expect(mapped.trialDate).toBeNull();
      expect(mapped.trialTimezone).toBeNull();
    });
  });
});
