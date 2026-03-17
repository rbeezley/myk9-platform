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
  type ReplicatedJudgeAssignment,
} from '../ReplicatedJudgeAssignmentsTable';

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
});
