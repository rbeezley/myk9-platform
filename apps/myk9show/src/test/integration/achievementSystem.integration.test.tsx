/**
 * Achievement System Integration Test
 *
 * Tests the achievement system including achievements with database
 * operations and React Query integration.
 *
 * Note: Competition and PastResult tests were removed because the corresponding
 * database tables don't exist. The UI uses local Zustand stores instead.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Import types and hooks
import {
  Achievement,
  CreateAchievementData,
} from '../../types/achievement';

import {
  useAchievements,
} from '../../hooks/queries/useAchievementsDatabase';

import { achievementMappers, competitionMappers, achievementUtils, importMappers } from '../../services/mappers/achievementMappers';

// Mock Supabase client
vi.mock('../../services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis()
    }))
  }
}));

// Test wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('Achievement System Integration', () => {
  const mockDogId = 'test-dog-123';

  const mockAchievement: CreateAchievementData = {
    dog_id: mockDogId,
    achievement_type: 'Title',
    title: 'Companion Dog (CD)',
    organization: 'AKC',
    discipline: 'Obedience',
    level: 'Novice',
    date_earned: '2024-01-15',
    points: 195,
    location: 'Denver, CO',
    judge_name: 'Jane Smith',
    is_active: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Achievement Operations', () => {
    it('should validate achievement data correctly', () => {
      const validAchievement = { ...mockAchievement };
      const errors = achievementMappers.validate(validAchievement);
      expect(errors).toHaveLength(0);

      const invalidAchievement: CreateAchievementData = {
        ...mockAchievement,
        dog_id: '',
        title: '',
        date_earned: 'invalid-date'
      };
      const invalidErrors = achievementMappers.validate(invalidAchievement);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Dog ID is required');
      expect(invalidErrors).toContain('Title is required');
    });

    it('should create achievement with proper data transformation', () => {
      const dbData = achievementMappers.toDatabase(mockAchievement);

      expect(dbData.dog_id).toBe(mockDogId);
      expect(dbData.title).toBe('Companion Dog (CD)');
      expect(dbData.organization).toBe('AKC');
      expect(dbData.is_active).toBe(true);
      expect(dbData.abbreviation).toBe(null); // undefined converted to null
    });

    it('should use achievement hooks correctly', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useAchievements(mockDogId),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('Competition Mappers (validation only)', () => {
    // Note: These tests validate the mapper logic, but the database hooks
    // and queries were removed since the competition table doesn't exist
    it('should validate competition data correctly', () => {
      const mockCompetition = {
        dog_id: mockDogId,
        competition_name: 'Rocky Mountain Dog Show',
        competition_date: '2024-02-20',
        location: 'Colorado Springs, CO',
        placement: '1st',
        score: '196.5',
        qualified: true,
        points_earned: 5,
        organization: 'AKC',
        discipline: 'Obedience',
        level: 'Novice',
        judge_name: 'Bob Johnson'
      };

      const errors = competitionMappers.validate(mockCompetition);
      expect(errors).toHaveLength(0);

      const invalidCompetition = {
        ...mockCompetition,
        dog_id: '',
        competition_name: ''
      };
      const invalidErrors = competitionMappers.validate(invalidCompetition);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Data Mappers and Utils', () => {
    it('should format achievement titles correctly', () => {
      const achievement: Achievement = {
        ...mockAchievement,
        id: 'test-id',
        abbreviation: 'CD',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const formatted = achievementUtils.formatAchievementTitle(achievement);
      expect(formatted).toBe('Companion Dog (CD) (CD)');

      const achievementNoAbbr: Achievement = {
        ...achievement,
        abbreviation: undefined
      };
      const formattedNoAbbr = achievementUtils.formatAchievementTitle(achievementNoAbbr);
      expect(formattedNoAbbr).toBe('Companion Dog (CD)');
    });

    it('should calculate points correctly', () => {
      const points = achievementUtils.calculatePoints('1st', 'AKC', 'Master');
      expect(points).toBe(10); // 5 * 2 (Master multiplier)

      const basicPoints = achievementUtils.calculatePoints('2nd', 'AKC');
      expect(basicPoints).toBe(3);

      const noPoints = achievementUtils.calculatePoints('NQ', 'AKC');
      expect(noPoints).toBe(0);
    });

    it('should identify qualifying placements', () => {
      expect(achievementUtils.isQualifyingPlacement('1st')).toBe(true);
      expect(achievementUtils.isQualifyingPlacement('Q')).toBe(true);
      expect(achievementUtils.isQualifyingPlacement('NQ')).toBe(false);
      expect(achievementUtils.isQualifyingPlacement('DQ')).toBe(false);
    });
  });

  describe('Organization and Discipline Configuration', () => {
    it('should provide valid organization configs', () => {
      const akcConfig = achievementUtils.getOrganizationConfig('AKC');
      expect(akcConfig?.name).toBe('American Kennel Club');
      expect(akcConfig?.disciplines).toContain('Obedience');
      expect(akcConfig?.achievement_types).toContain('Title');

      const invalidConfig = achievementUtils.getOrganizationConfig('INVALID');
      expect(invalidConfig).toBeUndefined();
    });

    it('should provide valid discipline configs', () => {
      const obedienceConfig = achievementUtils.getDisciplineConfig('Obedience');
      expect(obedienceConfig?.scoring_type).toBe('points');
      expect(obedienceConfig?.organizations).toContain('AKC');
    });

    it('should return valid achievement types for organizations', () => {
      const akcTypes = achievementUtils.getValidAchievementTypes('AKC');
      expect(akcTypes).toContain('Championship');
      expect(akcTypes).toContain('Title');

      const invalidTypes = achievementUtils.getValidAchievementTypes('INVALID');
      expect(invalidTypes.length).toBeGreaterThan(0); // Should fallback to default types
    });
  });

  describe('Import and Export Functions', () => {
    it('should validate import data correctly', () => {
      const importData = {
        dog_identifier: 'Buddy',
        achievement_type: 'Title',
        title: 'CD',
        organization: 'AKC',
        date_earned: '2024-01-01',
        source: 'Manual Entry'
      };

      const errors = importMappers.validateAchievementImport(importData);
      expect(errors).toHaveLength(0);

      const invalidImportData = {
        ...importData,
        dog_identifier: '',
        title: ''
      };
      const invalidErrors = importMappers.validateAchievementImport(invalidImportData);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });
  });
});
