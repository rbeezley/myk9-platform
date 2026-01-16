/**
 * Judge Management React Query Integration
 * 
 * Comprehensive hooks for all judge operations with optimistic updates,
 * cache management, and performance analytics.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  judgeQualificationQueries,
  judgeAssignmentQueries,
  judgeCertificationQueries,
  judgePerformanceQueries 
} from '../../services/database/queries/judgeQueries';
import {
  JudgeQualification,
  JudgeAssignment,
  JudgeCertification,
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  CreateJudgeAssignmentData,
  UpdateJudgeAssignmentData,
  CreateJudgeCertificationData,
  UpdateJudgeCertificationData,
  JudgeQualificationFilters,
  JudgeAssignmentFilters,
  JudgeCertificationFilters,
} from '../../types/judge-management';
import {
  validateJudgeQualification,
  validateJudgeAssignment,
  validateJudgeCertification
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

  assignments: () => [...judgeQueryKeys.all, 'assignments'] as const,
  assignment: (id: string) => [...judgeQueryKeys.assignments(), id] as const,
  assignmentsByJudge: (judgeId: string, filters?: JudgeAssignmentFilters) => 
    [...judgeQueryKeys.assignments(), 'byJudge', judgeId, filters] as const,
  assignmentsByShow: (showId: string, filters?: Omit<JudgeAssignmentFilters, 'show_id'>) => 
    [...judgeQueryKeys.assignments(), 'byShow', showId, filters] as const,
  assignmentSummary: (judgeId: string) => 
    [...judgeQueryKeys.assignments(), 'summary', judgeId] as const,

  certifications: () => [...judgeQueryKeys.all, 'certifications'] as const,
  certification: (id: string) => [...judgeQueryKeys.certifications(), id] as const,
  certificationsByJudge: (judgeId: string, filters?: JudgeCertificationFilters) => 
    [...judgeQueryKeys.certifications(), 'byJudge', judgeId, filters] as const,
  certificationSummary: (judgeId: string) => 
    [...judgeQueryKeys.certifications(), 'summary', judgeId] as const,

  performance: () => [...judgeQueryKeys.all, 'performance'] as const,
  performanceStats: (judgeId: string) => 
    [...judgeQueryKeys.performance(), 'stats', judgeId] as const
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
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.performanceStats(newQualification.person_id)
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

// Judge Assignment Hooks
export const useJudgeAssignments = (judgeId: string, filters?: JudgeAssignmentFilters) => {
  return useQuery({
    queryKey: judgeQueryKeys.assignmentsByJudge(judgeId, filters),
    queryFn: () => judgeAssignmentQueries.getByJudgeId(judgeId, filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch judge assignments'
    }
  });
};

export const useShowAssignments = (showId: string, filters?: Omit<JudgeAssignmentFilters, 'show_id'>) => {
  return useQuery({
    queryKey: judgeQueryKeys.assignmentsByShow(showId, filters),
    queryFn: () => judgeAssignmentQueries.getByShowId(showId, filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!showId,
    meta: {
      errorMessage: 'Failed to fetch show assignments'
    }
  });
};

export const useJudgeAssignment = (id: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.assignment(id),
    queryFn: () => judgeAssignmentQueries.getById(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    meta: {
      errorMessage: 'Failed to fetch judge assignment'
    }
  });
};

export const useJudgeAssignmentSummary = (judgeId: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.assignmentSummary(judgeId),
    queryFn: () => judgeAssignmentQueries.getSummary(judgeId),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch assignment summary'
    }
  });
};

export const useCreateJudgeAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateJudgeAssignmentData) => {
      // Validate before creating
      const validation = validateJudgeAssignment(data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      return judgeAssignmentQueries.create(data);
    },
    onSuccess: (newAssignment) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.assignmentsByJudge(newAssignment.judge_id)
      });
      if (newAssignment.show_id) {
        queryClient.invalidateQueries({ 
          queryKey: judgeQueryKeys.assignmentsByShow(newAssignment.show_id)
        });
      }
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.assignmentSummary(newAssignment.judge_id)
      });

      // Update cache with new assignment
      queryClient.setQueryData(
        judgeQueryKeys.assignment(newAssignment.id),
        newAssignment
      );
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'create',
        entityType: 'judge_assignment',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge assignment created successfully'
    }
  });
};

export const useUpdateJudgeAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateJudgeAssignmentData) => judgeAssignmentQueries.update(data),
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: judgeQueryKeys.assignment(data.id) });

      // Snapshot previous value
      const previousAssignment = queryClient.getQueryData<JudgeAssignment>(
        judgeQueryKeys.assignment(data.id)
      );

      // Optimistically update
      if (previousAssignment) {
        queryClient.setQueryData(
          judgeQueryKeys.assignment(data.id),
          { ...previousAssignment, ...data, updated_at: new Date().toISOString() }
        );
      }

      return { previousAssignment };
    },
    onError: (error, data, context) => {
      // Rollback on error
      if (context?.previousAssignment) {
        queryClient.setQueryData(
          judgeQueryKeys.assignment(data.id),
          context.previousAssignment
        );
      }
      errorMonitor.captureError(error, {
        operationType: 'update',
        entityType: 'judge_assignment',
        additionalData: { severity: 'medium' }
      });
    },
    onSettled: (data) => {
      if (data) {
        // Invalidate related queries
        queryClient.invalidateQueries({ 
          queryKey: judgeQueryKeys.assignmentsByJudge(data.judge_id)
        });
        if (data.show_id) {
          queryClient.invalidateQueries({ 
            queryKey: judgeQueryKeys.assignmentsByShow(data.show_id)
          });
        }
      }
    },
    meta: {
      successMessage: 'Judge assignment updated successfully'
    }
  });
};

export const useConfirmJudgeAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, confirmedBy }: { id: string; confirmedBy: string }) => 
      judgeAssignmentQueries.confirm(id, confirmedBy),
    onSuccess: (updatedAssignment) => {
      // Update cache
      queryClient.setQueryData(
        judgeQueryKeys.assignment(updatedAssignment.id),
        updatedAssignment
      );
      
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.assignmentsByJudge(updatedAssignment.judge_id)
      });
    },
    meta: {
      successMessage: 'Judge assignment confirmed'
    }
  });
};

export const useDeleteJudgeAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => judgeAssignmentQueries.delete(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: judgeQueryKeys.assignment(id) });
      
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.assignments() });
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'delete',
        entityType: 'judge_assignment',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge assignment deleted successfully'
    }
  });
};

// Judge Certification Hooks
export const useJudgeCertifications = (judgeId: string, filters?: JudgeCertificationFilters) => {
  return useQuery({
    queryKey: judgeQueryKeys.certificationsByJudge(judgeId, filters),
    queryFn: () => judgeCertificationQueries.getByJudgeId(judgeId, filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch judge certifications'
    }
  });
};

export const useJudgeCertification = (id: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.certification(id),
    queryFn: () => judgeCertificationQueries.getById(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!id,
    meta: {
      errorMessage: 'Failed to fetch judge certification'
    }
  });
};

export const useJudgeCertificationSummary = (judgeId: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.certificationSummary(judgeId),
    queryFn: () => judgeCertificationQueries.getSummary(judgeId),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch certification summary'
    }
  });
};

export const useCreateJudgeCertification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateJudgeCertificationData) => {
      // Validate before creating
      const validation = validateJudgeCertification(data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      return judgeCertificationQueries.create(data);
    },
    onSuccess: (newCertification) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.certificationsByJudge(newCertification.person_id)
      });
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.certificationSummary(newCertification.person_id)
      });
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.performanceStats(newCertification.person_id)
      });

      // Update cache with new certification
      queryClient.setQueryData(
        judgeQueryKeys.certification(newCertification.id),
        newCertification
      );
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'create',
        entityType: 'judge_certification',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge certification created successfully'
    }
  });
};

export const useUpdateJudgeCertification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateJudgeCertificationData) => judgeCertificationQueries.update(data),
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: judgeQueryKeys.certification(data.id) });

      // Snapshot previous value
      const previousCertification = queryClient.getQueryData<JudgeCertification>(
        judgeQueryKeys.certification(data.id)
      );

      // Optimistically update
      if (previousCertification) {
        queryClient.setQueryData(
          judgeQueryKeys.certification(data.id),
          { ...previousCertification, ...data, updated_at: new Date().toISOString() }
        );
      }

      return { previousCertification };
    },
    onError: (error, data, context) => {
      // Rollback on error
      if (context?.previousCertification) {
        queryClient.setQueryData(
          judgeQueryKeys.certification(data.id),
          context.previousCertification
        );
      }
      errorMonitor.captureError(error, {
        operationType: 'update',
        entityType: 'judge_certification',
        additionalData: { severity: 'medium' }
      });
    },
    onSettled: (data) => {
      if (data) {
        // Invalidate related queries
        queryClient.invalidateQueries({ 
          queryKey: judgeQueryKeys.certificationsByJudge(data.person_id)
        });
        queryClient.invalidateQueries({ 
          queryKey: judgeQueryKeys.certificationSummary(data.person_id)
        });
      }
    },
    meta: {
      successMessage: 'Judge certification updated successfully'
    }
  });
};

export const useRenewJudgeCertification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      id, 
      newExpirationDate, 
      continuingEducationHours 
    }: { 
      id: string; 
      newExpirationDate: string; 
      continuingEducationHours?: number;
    }) => judgeCertificationQueries.renew(id, newExpirationDate, continuingEducationHours),
    onSuccess: (updatedCertification) => {
      // Update cache
      queryClient.setQueryData(
        judgeQueryKeys.certification(updatedCertification.id),
        updatedCertification
      );
      
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.certificationsByJudge(updatedCertification.person_id)
      });
      queryClient.invalidateQueries({ 
        queryKey: judgeQueryKeys.certificationSummary(updatedCertification.person_id)
      });
    },
    meta: {
      successMessage: 'Judge certification renewed successfully'
    }
  });
};

export const useDeleteJudgeCertification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => judgeCertificationQueries.delete(id),
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: judgeQueryKeys.certification(id) });
      
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.certifications() });
    },
    onError: (error) => {
      errorMonitor.captureError(error, {
        operationType: 'delete',
        entityType: 'judge_certification',
        additionalData: { severity: 'high' }
      });
    },
    meta: {
      successMessage: 'Judge certification deleted successfully'
    }
  });
};

// Performance Analytics Hooks
export const useJudgePerformanceStats = (judgeId: string) => {
  return useQuery({
    queryKey: judgeQueryKeys.performanceStats(judgeId),
    queryFn: () => judgePerformanceQueries.getPerformanceStats(judgeId),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!judgeId,
    meta: {
      errorMessage: 'Failed to fetch judge performance stats'
    }
  });
};

// Batch Operations
export const useBatchJudgeOperations = () => {
  const queryClient = useQueryClient();

  const suspendMultipleQualifications = useMutation({
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

  const confirmMultipleAssignments = useMutation({
    mutationFn: async (operations: Array<{ id: string; confirmedBy: string }>) => {
      const results = await Promise.allSettled(
        operations.map(op => judgeAssignmentQueries.confirm(op.id, op.confirmedBy))
      );
      return results;
    },
    onSuccess: () => {
      // Invalidate all assignment queries
      queryClient.invalidateQueries({ queryKey: judgeQueryKeys.assignments() });
    },
    meta: {
      successMessage: 'Batch assignment confirmation completed'
    }
  });

  return {
    suspendMultipleQualifications,
    confirmMultipleAssignments
  };
};

// Cache Management Utilities
export const useJudgeCacheUtils = () => {
  const queryClient = useQueryClient();

  const prefetchJudgeData = async (judgeId: string) => {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: judgeQueryKeys.qualificationsByJudge(judgeId),
        queryFn: () => judgeQualificationQueries.getByJudgeId(judgeId),
        staleTime: 5 * 60 * 1000
      }),
      queryClient.prefetchQuery({
        queryKey: judgeQueryKeys.assignmentsByJudge(judgeId),
        queryFn: () => judgeAssignmentQueries.getByJudgeId(judgeId),
        staleTime: 5 * 60 * 1000
      }),
      queryClient.prefetchQuery({
        queryKey: judgeQueryKeys.certificationsByJudge(judgeId),
        queryFn: () => judgeCertificationQueries.getByJudgeId(judgeId),
        staleTime: 5 * 60 * 1000
      })
    ]);
  };

  const invalidateJudgeData = (judgeId: string) => {
    queryClient.invalidateQueries({ 
      queryKey: judgeQueryKeys.qualificationsByJudge(judgeId)
    });
    queryClient.invalidateQueries({ 
      queryKey: judgeQueryKeys.assignmentsByJudge(judgeId)
    });
    queryClient.invalidateQueries({ 
      queryKey: judgeQueryKeys.certificationsByJudge(judgeId)
    });
    queryClient.invalidateQueries({ 
      queryKey: judgeQueryKeys.performanceStats(judgeId)
    });
  };

  const clearJudgeCache = (judgeId: string) => {
    queryClient.removeQueries({ 
      queryKey: judgeQueryKeys.qualificationsByJudge(judgeId)
    });
    queryClient.removeQueries({ 
      queryKey: judgeQueryKeys.assignmentsByJudge(judgeId)
    });
    queryClient.removeQueries({ 
      queryKey: judgeQueryKeys.certificationsByJudge(judgeId)
    });
    queryClient.removeQueries({ 
      queryKey: judgeQueryKeys.performanceStats(judgeId)
    });
  };

  return {
    prefetchJudgeData,
    invalidateJudgeData,
    clearJudgeCache
  };
};