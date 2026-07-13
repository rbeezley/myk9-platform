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
  describe('replaceShowLevelAssignments', () => {
    it('deletes existing show-level rows and creates one per judge', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-old',
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
      // Class-level assignment for the same show must be left alone.
      await table.set('ja-2', {
        id: 'ja-2',
        personId: 'judge-class',
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

      await table.replaceShowLevelAssignments('show-1', ['judge-new-1', 'judge-new-2']);

      expect(await table.get('ja-1')).toBeNull();
      expect(await table.get('ja-2')).not.toBeNull();

      const showLevel = (await table.getByShowId('show-1')).filter(a => a.classId === null);
      expect(showLevel).toHaveLength(2);
      expect(showLevel.map(a => a.personId).sort()).toEqual(['judge-new-1', 'judge-new-2']);
      expect(showLevel.every(a => a.status === 'confirmed')).toBe(true);
    });

    it('leaves no show-level rows behind when the judge list is empty', async () => {
      await table.set('ja-1', {
        id: 'ja-1',
        personId: 'judge-old',
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

      await table.replaceShowLevelAssignments('show-1', []);

      expect(await table.getByShowId('show-1')).toHaveLength(0);
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
