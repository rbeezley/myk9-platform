/**
 * Judge Qualification React Query Hooks
 *
 * Hooks for judge qualification operations with optimistic updates
 * and cache management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  judgeQualificationQueries,
} from '../../services/database/queries/judgeQueries';
import {
  JudgeQualification,
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  JudgeQualificationFilters,
} from '../../types/judge-management';
import {
  validateJudgeQualification,
} from '../../services/mappers/judgeMappers';
import { errorMonitor } from '../../lib/errorMonitoring';

// Query Key Factories
export const judgeQueryKeys = {
  all: ['judge'] as const,
  qualifications: () => [...judgeQueryKeys.all, 'qualifications'] as const,
  qualification: (id: string) => [...judgeQueryKeys.qualifications(), id] as const,
  qualificationsByJudge: (judgeId: string, filters?: JudgeQualificationFilters) =>
    [...judgeQueryKeys.qualifications(), 'byJudge', judgeId, filters] as const,
  qualificationSummary: (judgeId: string) =>
    [...judgeQueryKeys.qualifications(), 'summary', judgeId] as const,
};

// Judge Qualification Hooks
export const useJudgeQualifications = (judgeId: string, filters?: JudgeQualificationFilters) => {
  return useQuery({
    queryKey: judgeQueryKeys.qualificationsByJudge(judgeId, filters),
    queryFn: () => judgeQualificationQueries.getByJudgeId(judgeId, filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch judge qualifications'
    }
  });
};

export const useJudgeQualification = (id: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.qualification(id),
    queryFn: () => judgeQualificationQueries.getById(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    meta: {
      errorMessage: 'Failed to fetch judge qualification'
    }
  });
};

export const useJudgeQualificationSummary = (judgeId: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.qualificationSummary(judgeId),
    queryFn: () => judgeQualificationQueries.getSummary(judgeId),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch qualification summary'
    }
  });
};

export const useCreateJudgeQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateJudgeQualificationData) => {
      // Validate before creating
      const validation = validateJudgeQualification(data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      return judgeQualificationQueries.create(data);
    },
    onSuccess: (newQualification) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: judgeQueryKeys.qualificationsByJudge(newQualification.person_id)
      });
      queryClient.invalidateQueries({
        queryKey: judgeQueryKeys.qualificationSummary(newQualification.person_id)
      });

      // Update cache with new qualification
      queryClient.setQueryData(
        judgeQueryKeys.qualification(newQualification.id),
        newQualification
      );
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'create',
        entityType: 'judge_qualification',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge qualification created successfully'
    }
  });
};

export const useUpdateJudgeQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateJudgeQualificationData) => judgeQualificationQueries.update(data),
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: judgeQueryKeys.qualification(data.id) });

      // Snapshot previous value
      const previousQualification = queryClient.getQueryData<JudgeQualification>(
        judgeQueryKeys.qualification(data.id)
      );

      // Optimistically update
      if (previousQualification) {
        queryClient.setQueryData(
          judgeQueryKeys.qualification(data.id),
          { ...previousQualification, ...data, updated_at: new Date().toISOString() }
        );
      }

      return { previousQualification };
    },
    onError: (error, data, context) => {
      // Rollback on error
      if (context?.previousQualification) {
        queryClient.setQueryData(
          judgeQueryKeys.qualification(data.id),
          context.previousQualification
        );
      }
      errorMonitor.captureError(error, {
        operationType: 'update',
        entityType: 'judge_qualification',
        additionalData: { severity: 'medium' }
      });
    },
    onSettled: (data) => {
      if (data) {
        // Invalidate related queries
        queryClient.invalidateQueries({
          queryKey: judgeQueryKeys.qualificationsByJudge(data.person_id)
        });
        queryClient.invalidateQueries({
          queryKey: judgeQueryKeys.qualificationSummary(data.person_id)
        });
      }
    },
    meta: {
      successMessage: 'Judge qualification updated successfully'
    }
  });
};

export const useDeleteJudgeQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => judgeQualificationQueries.delete(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: judgeQueryKeys.qualification(id) });

      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.qualifications() });
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'delete',
        entityType: 'judge_qualification',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge qualification deleted successfully'
    }
  });
};

export const useSuspendJudgeQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      judgeQualificationQueries.suspend(id, reason),
    onSuccess: (updatedQualification) => {
      // Update cache
      queryClient.setQueryData(
        judgeQueryKeys.qualification(updatedQualification.id),
        updatedQualification
      );

      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: judgeQueryKeys.qualificationsByJudge(updatedQualification.person_id)
      });
    },
    meta: {
      successMessage: 'Judge qualification suspended'
    }
  });
};

export const useReinstateJudgeQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => judgeQualificationQueries.reinstate(id),
    onSuccess: (updatedQualification) => {
      // Update cache
      queryClient.setQueryData(
        judgeQueryKeys.qualification(updatedQualification.id),
        updatedQualification
      );

      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: judgeQueryKeys.qualificationsByJudge(updatedQualification.person_id)
      });
    },
    meta: {
      successMessage: 'Judge qualification reinstated'
    }
  });
};

// Batch Operations
export const useBatchSuspendQualifications = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (operations: Array<{ id: string; reason: string }>) => {
      const results = await Promise.allSettled(
        operations.map(op => judgeQualificationQueries.suspend(op.id, op.reason))
      );
      return results;
    },
    onSuccess: () => {
      // Invalidate all qualification queries
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.qualifications() });
    },
    meta: {
      successMessage: 'Batch qualification suspension completed'
    }
  });
};

// Cache Management Utilities
export const useJudgeQualificationCacheUtils = () => {
  const queryClient = useQueryClient();

  const prefetchQualifications = async (judgeId: string) => {
    await queryClient.prefetchQuery({
      queryKey: judgeQueryKeys.qualificationsByJudge(judgeId),
      queryFn: () => judgeQualificationQueries.getByJudgeId(judgeId),
      staleTime: 5 * 60 * 1000
    });
  };

  const invalidateQualifications = (judgeId: string) => {
    queryClient.invalidateQueries({
      queryKey: judgeQueryKeys.qualificationsByJudge(judgeId)
    });
    queryClient.invalidateQueries({
      queryKey: judgeQueryKeys.qualificationSummary(judgeId)
    });
  };

  const clearQualificationCache = (judgeId: string) => {
    queryClient.removeQueries({
      queryKey: judgeQueryKeys.qualificationsByJudge(judgeId)
    });
    queryClient.removeQueries({
      queryKey: judgeQueryKeys.qualificationSummary(judgeId)
    });
  };

  return {
    prefetchQualifications,
    invalidateQualifications,
    clearQualificationCache
  };
};
