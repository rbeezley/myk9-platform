/**
 * Judge System Integration Tests
 * 
 * Comprehensive integration tests for judge qualifications, assignments,
 * and certifications including CRUD operations, filtering, and analytics.
 */

import React from 'react';
import { logger } from '@/services/LoggingService';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useJudgeQualifications,
  useJudgeAssignments,
  useJudgeCertifications,
  useCreateJudgeQualification,
  useCreateJudgeAssignment,
  useCreateJudgeCertification,
  useDeleteJudgeQualification,
  useJudgePerformanceStats,
  useSuspendJudgeQualification,
  useReinstateJudgeQualification,
  useConfirmJudgeAssignment,
  useRenewJudgeCertification,
  useBatchJudgeOperations,
  useJudgeCacheUtils
} from '../../hooks/queries/useJudgeDatabase';
import {
  judgeQualificationQueries,
  judgeAssignmentQueries,
  judgeCertificationQueries,
  judgePerformanceQueries
} from '../../services/database/queries/judgeQueries';
import {
  CreateJudgeQualificationData,
  CreateJudgeAssignmentData,
  CreateJudgeCertificationData,
  JudgeQualificationFilters,
  JudgeAssignmentFilters,
  JudgeCertificationFilters
} from '../../types/judge-management';

// Mock the database queries
vi.mock('../../services/database/queries/judgeQueries');

// Test data
const mockJudgeId = 'test-judge-id';
const mockQualificationId = 'test-qualification-id';
const mockAssignmentId = 'test-assignment-id';
const mockCertificationId = 'test-certification-id';

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

const mockAssignment = {
  id: mockAssignmentId,
  judge_id: mockJudgeId,
  show_id: 'test-show-id',
  assignment_type: 'Regular Class',
  assignment_date: '2024-03-15',
  assigned_classes: ['Novice Container', 'Advanced Container'],
  assigned_rings: ['Ring 1'],
  assignment_status: 'Confirmed',
  confirmed_at: '2024-02-15T00:00:00Z',
  confirmed_by: 'Secretary Name',
  compensation_amount: 300,
  travel_provided: true,
  expenses_covered: true,
  special_requirements: 'None',
  notes: 'Test assignment',
  created_at: '2024-02-10T00:00:00Z',
  updated_at: '2024-02-15T00:00:00Z'
};

const mockCertification = {
  id: mockCertificationId,
  person_id: mockJudgeId,
  certification_name: 'Certified Scent Work Judge',
  issuing_body: 'NACSW',
  certification_number: 'NACSW-567',
  date_obtained: '2023-06-01',
  expiration_date: '2025-06-01',
  renewal_required: true,
  next_renewal_date: '2025-06-01',
  continuing_education_hours: 20,
  is_active: true,
  notes: 'Test certification',
  created_at: '2023-06-01T00:00:00Z',
  updated_at: '2023-06-01T00:00:00Z'
};

const mockPerformanceStats = {
  qualification_summary: {
    total_qualifications: 2,
    active_qualifications: 2,
    expired_qualifications: 0,
    suspended_qualifications: 0,
    expiring_soon: 0,
    organizations: ['AKC', 'NACSW'],
    disciplines: ['Scent Work', 'Agility'],
    latest_qualification: mockQualification,
    qualifications_by_organization: { AKC: 1, NACSW: 1 },
    qualifications_by_level: { Regular: 1, 'Certified Scent Work Judge': 1 }
  },
  assignment_summary: {
    total_assignments: 5,
    upcoming_assignments: 2,
    completed_assignments: 3,
    confirmed_assignments: 4,
    pending_assignments: 1,
    shows_judged: ['show1', 'show2', 'show3'],
    assignment_types: ['Regular Class', 'Trial'],
    total_compensation: 1500,
    recent_assignments: [mockAssignment],
    assignments_by_type: { 'Regular Class': 3, 'Trial': 2 },
    assignments_by_status: { 'Confirmed': 4, 'Pending': 1 }
  },
  certification_summary: {
    total_certifications: 1,
    active_certifications: 1,
    expired_certifications: 0,
    expiring_soon: 0,
    renewal_required: 1,
    continuing_education_total: 20,
    issuing_bodies: ['NACSW'],
    certification_types: ['Certified Scent Work Judge'],
    latest_certification: mockCertification,
    certifications_by_body: { NACSW: 1 },
    certifications_by_type: { 'Certified Scent Work Judge': 1 }
  },
  career_highlights: {
    first_qualification: mockQualification,
    first_certification: mockCertification,
    most_recent_assignment: mockAssignment,
    highest_compensation_assignment: mockAssignment,
    total_shows_judged: 3,
    years_active: 1,
    favorite_disciplines: ['Scent Work', 'Agility']
  },
  activity_trend: [
    { month: '2024-01', assignments: 2, shows: 1, compensation: 600 },
    { month: '2024-02', assignments: 1, shows: 1, compensation: 300 },
    { month: '2024-03', assignments: 2, shows: 1, compensation: 600 }
  ]
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

describe('Judge System Integration Tests', () => {
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

  describe('Judge Assignments', () => {
    it('should fetch judge assignments successfully', async () => {
      const mockGetByJudgeId = vi.mocked(judgeAssignmentQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockAssignment]);

      const { result } = renderHook(
        () => useJudgeAssignments(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockAssignment]);
      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, undefined);
    });

    it('should fetch judge assignments with filters', async () => {
      const mockGetByJudgeId = vi.mocked(judgeAssignmentQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockAssignment]);

      const filters: JudgeAssignmentFilters = {
        assignment_type: 'Regular Class',
        assignment_status: 'Confirmed',
        confirmed: true
      };

      const { result } = renderHook(
        () => useJudgeAssignments(mockJudgeId, filters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, filters);
    });

    it('should create a new judge assignment', async () => {
      const mockCreate = vi.mocked(judgeAssignmentQueries.create);
      mockCreate.mockResolvedValue(mockAssignment);

      const { result } = renderHook(
        () => useCreateJudgeAssignment(),
        { wrapper: createWrapper() }
      );

      const createData: CreateJudgeAssignmentData = {
        judge_id: mockJudgeId,
        show_id: 'test-show-id',
        assignment_type: 'Regular Class',
        assignment_date: '2024-03-15',
        compensation_amount: 300
      };

      result.current.mutate(createData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockCreate).toHaveBeenCalledWith(createData);
      expect(result.current.data).toEqual(mockAssignment);
    });

    it('should confirm a judge assignment', async () => {
      const mockConfirm = vi.mocked(judgeAssignmentQueries.confirm);
      mockConfirm.mockResolvedValue(mockAssignment);

      const { result } = renderHook(
        () => useConfirmJudgeAssignment(),
        { wrapper: createWrapper() }
      );

      result.current.mutate({ id: mockAssignmentId, confirmedBy: 'Secretary Name' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockConfirm).toHaveBeenCalledWith(mockAssignmentId, 'Secretary Name');
      expect(result.current.data).toEqual(mockAssignment);
    });
  });

  describe('Judge Certifications', () => {
    it('should fetch judge certifications successfully', async () => {
      const mockGetByJudgeId = vi.mocked(judgeCertificationQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockCertification]);

      const { result } = renderHook(
        () => useJudgeCertifications(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockCertification]);
      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, undefined);
    });

    it('should create a new judge certification', async () => {
      const mockCreate = vi.mocked(judgeCertificationQueries.create);
      mockCreate.mockResolvedValue(mockCertification);

      const { result } = renderHook(
        () => useCreateJudgeCertification(),
        { wrapper: createWrapper() }
      );

      const createData: CreateJudgeCertificationData = {
        person_id: mockJudgeId,
        certification_name: 'Certified Scent Work Judge',
        issuing_body: 'NACSW',
        date_obtained: '2023-06-01',
        expiration_date: '2025-06-01'
      };

      result.current.mutate(createData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockCreate).toHaveBeenCalledWith(createData);
      expect(result.current.data).toEqual(mockCertification);
    });

    it('should renew a judge certification', async () => {
      const mockRenew = vi.mocked(judgeCertificationQueries.renew);
      const renewedCertification = {
        ...mockCertification,
        expiration_date: '2027-06-01',
        continuing_education_hours: 40
      };
      mockRenew.mockResolvedValue(renewedCertification);

      const { result } = renderHook(
        () => useRenewJudgeCertification(),
        { wrapper: createWrapper() }
      );

      result.current.mutate({
        id: mockCertificationId,
        newExpirationDate: '2027-06-01',
        continuingEducationHours: 40
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockRenew).toHaveBeenCalledWith(mockCertificationId, '2027-06-01', 40);
      expect(result.current.data).toEqual(renewedCertification);
    });
  });

  describe('Performance Analytics', () => {
    it('should fetch judge performance stats successfully', async () => {
      const mockGetPerformanceStats = vi.mocked(judgePerformanceQueries.getPerformanceStats);
      mockGetPerformanceStats.mockResolvedValue(mockPerformanceStats);

      const { result } = renderHook(
        () => useJudgePerformanceStats(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPerformanceStats);
      expect(mockGetPerformanceStats).toHaveBeenCalledWith(mockJudgeId);
    });

    it('should include all summary data in performance stats', async () => {
      const mockGetPerformanceStats = vi.mocked(judgePerformanceQueries.getPerformanceStats);
      mockGetPerformanceStats.mockResolvedValue(mockPerformanceStats);

      const { result } = renderHook(
        () => useJudgePerformanceStats(mockJudgeId),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const stats = result.current.data!;
      expect(stats.qualification_summary).toBeDefined();
      expect(stats.assignment_summary).toBeDefined();
      expect(stats.certification_summary).toBeDefined();
      expect(stats.career_highlights).toBeDefined();
      expect(stats.activity_trend).toBeDefined();

      // Verify career highlights include certification data
      expect(stats.career_highlights.first_certification).toEqual(mockCertification);
    });
  });

  describe('Batch Operations', () => {
    it('should suspend multiple qualifications', async () => {
      const mockSuspend = vi.mocked(judgeQualificationQueries.suspend);
      mockSuspend.mockResolvedValue(mockQualification);

      const { result } = renderHook(
        () => useBatchJudgeOperations(),
        { wrapper: createWrapper() }
      );

      const operations = [
        { id: 'qual-1', reason: 'Reason 1' },
        { id: 'qual-2', reason: 'Reason 2' }
      ];

      result.current.suspendMultipleQualifications.mutate(operations);

      await waitFor(() => {
        expect(result.current.suspendMultipleQualifications.isSuccess).toBe(true);
      });

      expect(mockSuspend).toHaveBeenCalledTimes(2);
      expect(mockSuspend).toHaveBeenCalledWith('qual-1', 'Reason 1');
      expect(mockSuspend).toHaveBeenCalledWith('qual-2', 'Reason 2');
    });

    it('should confirm multiple assignments', async () => {
      const mockConfirm = vi.mocked(judgeAssignmentQueries.confirm);
      mockConfirm.mockResolvedValue(mockAssignment);

      const { result } = renderHook(
        () => useBatchJudgeOperations(),
        { wrapper: createWrapper() }
      );

      const operations = [
        { id: 'assign-1', confirmedBy: 'Secretary 1' },
        { id: 'assign-2', confirmedBy: 'Secretary 2' }
      ];

      result.current.confirmMultipleAssignments.mutate(operations);

      await waitFor(() => {
        expect(result.current.confirmMultipleAssignments.isSuccess).toBe(true);
      });

      expect(mockConfirm).toHaveBeenCalledTimes(2);
      expect(mockConfirm).toHaveBeenCalledWith('assign-1', 'Secretary 1');
      expect(mockConfirm).toHaveBeenCalledWith('assign-2', 'Secretary 2');
    });
  });

  describe('Cache Management', () => {
    it('should prefetch judge data', async () => {
      const mockGetQualifications = vi.mocked(judgeQualificationQueries.getByJudgeId);
      const mockGetAssignments = vi.mocked(judgeAssignmentQueries.getByJudgeId);
      const mockGetCertifications = vi.mocked(judgeCertificationQueries.getByJudgeId);

      mockGetQualifications.mockResolvedValue([mockQualification]);
      mockGetAssignments.mockResolvedValue([mockAssignment]);
      mockGetCertifications.mockResolvedValue([mockCertification]);

      const { result } = renderHook(
        () => useJudgeCacheUtils(),
        { wrapper: createWrapper() }
      );

      await result.current.prefetchJudgeData(mockJudgeId);

      expect(mockGetQualifications).toHaveBeenCalledWith(mockJudgeId);
      expect(mockGetAssignments).toHaveBeenCalledWith(mockJudgeId);
      expect(mockGetCertifications).toHaveBeenCalledWith(mockJudgeId);
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

    it('should apply date range filters to assignments', async () => {
      const mockGetByJudgeId = vi.mocked(judgeAssignmentQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockAssignment]);

      const dateFilters: JudgeAssignmentFilters = {
        assignment_date_from: '2024-01-01',
        assignment_date_to: '2024-12-31',
        assignment_status: 'Confirmed'
      };

      const { result } = renderHook(
        () => useJudgeAssignments(mockJudgeId, dateFilters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, dateFilters);
    });

    it('should apply certification filters', async () => {
      const mockGetByJudgeId = vi.mocked(judgeCertificationQueries.getByJudgeId);
      mockGetByJudgeId.mockResolvedValue([mockCertification]);

      const certFilters: JudgeCertificationFilters = {
        issuing_body: 'NACSW',
        certification_name: 'Certified',
        is_active: true,
        renewal_required: true,
        expiring_within_days: 60
      };

      const { result } = renderHook(
        () => useJudgeCertifications(mockJudgeId, certFilters),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGetByJudgeId).toHaveBeenCalledWith(mockJudgeId, certFilters);
    });
  });
});