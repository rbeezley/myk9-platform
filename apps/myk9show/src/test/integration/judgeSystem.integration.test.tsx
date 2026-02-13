/**
 * Judge Qualification System Integration Tests
 *
 * Integration tests for judge qualification CRUD operations,
 * filtering, suspension/reinstatement, and cache management.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useJudgeQualifications,
  useCreateJudgeQualification,
  useUpdateJudgeQualification,
  useDeleteJudgeQualification,
  useSuspendJudgeQualification,
  useReinstateJudgeQualification,
  useBatchSuspendQualifications,
  useJudgeQualificationCacheUtils
} from '../../hooks/queries/useJudgeDatabase';
import {
  judgeQualificationQueries,
} from '../../services/database/queries/judgeQueries';
import {
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  JudgeQualificationFilters,
} from '../../types/judge-management';

// Mock the database queries
vi.mock('../../services/database/queries/judgeQueries');

// Test data
const mockJudgeId = 'test-judge-id';
const mockQualificationId = 'test-qualification-id';

const mockQualification = {
  id: mockQualificationId,
  person_id: mockJudgeId,
  organization: 'AKC',
  qualification_level: 'Regular',
  disciplines: ['Scent Work', 'Agility'],
  date_obtained: '2023-01-15',
  expiration_date: '2028-01-15',
  approval_number: 'AKC-12345',
  approved_by: 'John Smith',
  is_active: true,
  suspension_date: undefined,
  suspension_reason: undefined,
  notes: 'Test qualification',
  created_at: '2023-01-15T00:00:00Z',
  updated_at: '2023-01-15T00:00:00Z'
};

// Test wrapper component
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Judge Qualification System Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Judge Qualifications', () => {
    it('should fetch judge qualifications successfully', async () => {
      const mockGetByJudgeId = vi.mocked(judgeQualificationQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockQualification]);

      const { result } = renderHook(
        () => useJudgeQualifications(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockQualification]);
      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, undefined);
    });

    it('should fetch judge qualifications with filters', async () => {
      const mockGetByJudgeId = vi.mocked(judgeQualificationQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockQualification]);

      const filters: JudgeQualificationFilters = {
        organization: 'AKC',
        qualification_level: 'Regular',
        is_active: true
      };

      const { result } = renderHook(
        () => useJudgeQualifications(mockJudgeId, filters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, filters);
    });

    it('should create a new judge qualification', async () => {
      const mockCreate = vi.mocked(judgeQualificationQueries.create);
      mockCreate.mockResolvedValue(mockQualification);

      const { result } = renderHook(
        () => useCreateJudgeQualification(),
        { wrapper: createWrapper() }
      );

      const createData: CreateJudgeQualificationData = {
        person_id: mockJudgeId,
        organization: 'AKC',
        qualification_level: 'Regular',
        disciplines: ['Scent Work'],
        date_obtained: '2023-01-15',
        approval_number: 'AKC-12345'
      };

      result.current.mutate(createData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockCreate).toHaveBeenCalledWith(createData);
      expect(result.current.data).toEqual(mockQualification);
    });

    it('should update a judge qualification', async () => {
      const mockUpdate = vi.mocked(judgeQualificationQueries.update);
      const updatedQualification = { ...mockQualification, notes: 'Updated notes' };
      mockUpdate.mockResolvedValue(updatedQualification);

      const { result } = renderHook(
        () => useUpdateJudgeQualification(),
        { wrapper: createWrapper() }
      );

      const updateData: UpdateJudgeQualificationData = {
        id: mockQualificationId,
        notes: 'Updated notes'
      };

      result.current.mutate(updateData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUpdate).toHaveBeenCalledWith(updateData);
      expect(result.current.data).toEqual(updatedQualification);
    });

    it('should suspend a judge qualification', async () => {
      const mockSuspend = vi.mocked(judgeQualificationQueries.suspend);
      const suspendedQualification = {
        ...mockQualification,
        is_active: false,
        suspension_date: '2024-01-15',
        suspension_reason: 'Policy violation'
      };
      mockSuspend.mockResolvedValue(suspendedQualification);

      const { result } = renderHook(
        () => useSuspendJudgeQualification(),
        { wrapper: createWrapper() }
      );

      result.current.mutate({ id: mockQualificationId, reason: 'Policy violation' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSuspend).toHaveBeenCalledWith(mockQualificationId, 'Policy violation');
      expect(result.current.data).toEqual(suspendedQualification);
    });

    it('should reinstate a judge qualification', async () => {
      const mockReinstate = vi.mocked(judgeQualificationQueries.reinstate);
      mockReinstate.mockResolvedValue(mockQualification);

      const { result } = renderHook(
        () => useReinstateJudgeQualification(),
        { wrapper: createWrapper() }
      );

      result.current.mutate(mockQualificationId);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockReinstate).toHaveBeenCalledWith(mockQualificationId);
      expect(result.current.data).toEqual(mockQualification);
    });

    it('should delete a judge qualification', async () => {
      const mockDelete = vi.mocked(judgeQualificationQueries.delete);
      mockDelete.mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useDeleteJudgeQualification(),
        { wrapper: createWrapper() }
      );

      result.current.mutate(mockQualificationId);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockDelete).toHaveBeenCalledWith(mockQualificationId);
    });
  });

  describe('Batch Operations', () => {
    it('should suspend multiple qualifications', async () => {
      const mockSuspend = vi.mocked(judgeQualificationQueries.suspend);
      mockSuspend.mockResolvedValue(mockQualification);

      const { result } = renderHook(
        () => useBatchSuspendQualifications(),
        { wrapper: createWrapper() }
      );

      const operations = [
        { id: 'qual-1', reason: 'Reason 1' },
        { id: 'qual-2', reason: 'Reason 2' }
      ];

      result.current.mutate(operations);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSuspend).toHaveBeenCalledTimes(2);
      expect(mockSuspend).toHaveBeenCalledWith('qual-1', 'Reason 1');
      expect(mockSuspend).toHaveBeenCalledWith('qual-2', 'Reason 2');
    });
  });

  describe('Cache Management', () => {
    it('should prefetch judge qualification data', async () => {
      const mockGetQualifications = vi.mocked(judgeQualificationQueries.getByJudgeId);
      mockGetQualifications.mockResolvedValue([mockQualification]);

      const { result } = renderHook(
        () => useJudgeQualificationCacheUtils(),
        { wrapper: createWrapper() }
      );

      await result.current.prefetchQualifications(mockJudgeId);

      expect(mockGetQualifications).toHaveBeenCalledWith(mockJudgeId);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors in qualification creation', async () => {
      const { result } = renderHook(
        () => useCreateJudgeQualification(),
        { wrapper: createWrapper() }
      );

      const invalidData: CreateJudgeQualificationData = {
        person_id: '', // Invalid - empty
        organization: 'INVALID_ORG', // Invalid organization
        qualification_level: 'Regular',
        disciplines: [], // Invalid - empty array
        date_obtained: 'invalid-date' // Invalid date format
      };

      result.current.mutate(invalidData);

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Validation failed');
    });

    it('should handle network errors gracefully', async () => {
      const mockGetByJudgeId = vi.mocked(judgeQualificationQueries.getByJudgeId);
      mockGetByJudgeId.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(
        () => useJudgeQualifications(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error');
    });
  });

  describe('Filter and Search Functionality', () => {
    it('should apply complex filters to qualifications', async () => {
      const mockGetByJudgeId = vi.mocked(judgeQualificationQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockQualification]);

      const complexFilters: JudgeQualificationFilters = {
        organization: 'AKC',
        qualification_level: 'Regular',
        discipline: 'Scent Work',
        is_active: true,
        expiring_within_days: 30,
        suspended: false
      };

      const { result } = renderHook(
        () => useJudgeQualifications(mockJudgeId, complexFilters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, complexFilters);
    });
  });
});
