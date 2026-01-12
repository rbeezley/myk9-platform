/**
 * Achievement and Competition Data Mappers
 * 
 * Transform data between database format and application format,
 * handle validation, and provide utility functions for achievement data.
 */

import { logger } from '@/services/LoggingService';
import {
  Achievement,
  Competition,
  PastResult,
  CreateAchievementData,
  CreateCompetitionData,
  CreatePastResultData,
  ImportAchievementData,
  ImportCompetitionData,
  OrganizationConfig,
  DisciplineConfig,
  ACHIEVEMENT_TYPES,
  DISCIPLINES
} from '../../types/achievement';

// Database to App Mappers
export const achievementMappers = {
  // Map database achievement to app format
  fromDatabase(dbAchievement: Record<string, unknown>): Achievement {
    return {
      id: dbAchievement.id as string,
      dog_id: dbAchievement.dog_id as string,
      achievement_type: dbAchievement.achievement_type as string,
      title: dbAchievement.title as string,
      abbreviation: dbAchievement.abbreviation as string || undefined,
      organization: dbAchievement.organization as string,
      discipline: dbAchievement.discipline as string || undefined,
      level: dbAchievement.level as string || undefined,
      date_earned: dbAchievement.date_earned as string,
      points: dbAchievement.points as number || undefined,
      location: dbAchievement.location as string || undefined,
      judge_name: dbAchievement.judge_name as string || undefined,
      certificate_number: dbAchievement.certificate_number as string || undefined,
      certificate_url: dbAchievement.certificate_url as string || undefined,
      notes: dbAchievement.notes as string || undefined,
      is_active: dbAchievement.is_active as boolean ?? true,
      created_at: dbAchievement.created_at as string,
      updated_at: dbAchievement.updated_at as string
    };
  },

  // Map app achievement to database format
  toDatabase(achievement: CreateAchievementData) {
    return {
      dog_id: achievement.dog_id,
      achievement_type: achievement.achievement_type,
      title: achievement.title,
      abbreviation: achievement.abbreviation || null,
      organization: achievement.organization,
      discipline: achievement.discipline || null,
      level: achievement.level || null,
      date_earned: achievement.date_earned,
      points: achievement.points || null,
      location: achievement.location || null,
      judge_name: achievement.judge_name || null,
      certificate_number: achievement.certificate_number || null,
      certificate_url: achievement.certificate_url || null,
      notes: achievement.notes || null,
      is_active: achievement.is_active ?? true
    };
  },

  // Validate achievement data
  validate(data: CreateAchievementData): string[] {
    const errors: string[] = [];

    if (!data.dog_id) {
      errors.push('Dog ID is required');
    }

    if (!data.achievement_type) {
      errors.push('Achievement type is required');
    }

    if (!data.title) {
      errors.push('Title is required');
    }

    if (!data.organization) {
      errors.push('Organization is required');
    }

    if (!data.date_earned) {
      errors.push('Date earned is required');
    } else {
      const date = new Date(data.date_earned);
      if (isNaN(date.getTime())) {
        errors.push('Invalid date format');
      }
      if (date > new Date()) {
        errors.push('Date earned cannot be in the future');
      }
    }

    if (data.points !== undefined && data.points < 0) {
      errors.push('Points cannot be negative');
    }

    if (data.certificate_url && !this.isValidUrl(data.certificate_url)) {
      errors.push('Invalid certificate URL format');
    }

    return errors;
  },

  // Helper function to validate URLs
  isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }
};

export const competitionMappers = {
  // Map database competition to app format
  fromDatabase(dbCompetition: Record<string, unknown>): Competition {
    return {
      id: dbCompetition.id as string,
      dog_id: dbCompetition.dog_id as string,
      show_id: dbCompetition.show_id as string || undefined,
      class_id: dbCompetition.class_id as string || undefined,
      competition_name: dbCompetition.competition_name as string,
      competition_date: dbCompetition.competition_date as string,
      location: dbCompetition.location as string || undefined,
      placement: dbCompetition.placement as string || undefined,
      score: dbCompetition.score as string || undefined,
      time_seconds: dbCompetition.time_seconds as number || undefined,
      qualified: dbCompetition.qualified as boolean,
      points_earned: dbCompetition.points_earned as number || 0,
      organization: dbCompetition.organization as string || undefined,
      discipline: dbCompetition.discipline as string || undefined,
      level: dbCompetition.level as string || undefined,
      judge_name: dbCompetition.judge_name as string || undefined,
      notes: dbCompetition.notes as string || undefined,
      created_at: dbCompetition.created_at as string,
      updated_at: dbCompetition.updated_at as string
    };
  },

  // Map app competition to database format
  toDatabase(competition: CreateCompetitionData) {
    return {
      dog_id: competition.dog_id,
      show_id: competition.show_id || null,
      class_id: competition.class_id || null,
      competition_name: competition.competition_name,
      competition_date: competition.competition_date,
      location: competition.location || null,
      placement: competition.placement || null,
      score: competition.score || null,
      time_seconds: competition.time_seconds || null,
      qualified: competition.qualified,
      points_earned: competition.points_earned || 0,
      organization: competition.organization || null,
      discipline: competition.discipline || null,
      level: competition.level || null,
      judge_name: competition.judge_name || null,
      notes: competition.notes || null
    };
  },

  // Validate competition data
  validate(data: CreateCompetitionData): string[] {
    const errors: string[] = [];

    if (!data.dog_id) {
      errors.push('Dog ID is required');
    }

    if (!data.competition_name) {
      errors.push('Competition name is required');
    }

    if (!data.competition_date) {
      errors.push('Competition date is required');
    } else {
      const date = new Date(data.competition_date);
      if (isNaN(date.getTime())) {
        errors.push('Invalid date format');
      }
    }

    if (data.time_seconds !== undefined && data.time_seconds < 0) {
      errors.push('Time cannot be negative');
    }

    if (data.points_earned !== undefined && data.points_earned < 0) {
      errors.push('Points earned cannot be negative');
    }

    return errors;
  },

  // Parse time from various formats (e.g., "1:23.45", "83.45", "1m 23.45s")
  parseTime(timeString: string): number | undefined {
    if (!timeString) return undefined;

    // Remove whitespace and convert to lowercase
    const cleaned = timeString.trim().toLowerCase();

    // Try to match common time formats
    const patterns = [
      /^(\d+):(\d+)\.(\d+)$/, // MM:SS.ss
      /^(\d+):(\d+)$/, // MM:SS
      /^(\d+)\.(\d+)$/, // SS.ss
      /^(\d+)$/, // SS
      /^(\d+)m\s*(\d+)\.(\d+)s$/, // XmYY.ssS
      /^(\d+)m\s*(\d+)s$/ // XmYYs
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        return this.convertToSeconds(match);
      }
    }

    // Try parsing as a direct number
    const directNumber = parseFloat(cleaned);
    if (!isNaN(directNumber)) {
      return directNumber;
    }

    return undefined;
  },

  // Convert regex match to seconds
  convertToSeconds(match: RegExpMatchArray): number {
    const groups = match.slice(1).map(g => parseFloat(g));

    if (match[0].includes(':')) {
      // Time format with colon (MM:SS or MM:SS.ss)
      const minutes = groups[0];
      const seconds = groups[1];
      const milliseconds = groups[2] || 0;
      return minutes * 60 + seconds + milliseconds / 100;
    } else if (match[0].includes('m')) {
      // Text format with 'm' and 's'
      const minutes = groups[0];
      const seconds = groups[1];
      const milliseconds = groups[2] || 0;
      return minutes * 60 + seconds + milliseconds / 100;
    } else {
      // Direct seconds format
      const seconds = groups[0];
      const milliseconds = groups[1] || 0;
      return seconds + milliseconds / 100;
    }
  },

  // Format time for display
  formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
  }
};

export const pastResultMappers = {
  // Map database past result to app format
  fromDatabase(dbPastResult: Record<string, unknown>): PastResult {
    return {
      id: dbPastResult.id as string,
      dog_id: dbPastResult.dog_id as string,
      show_id: dbPastResult.show_id as string || undefined,
      show_name: dbPastResult.show_name as string,
      show_date: dbPastResult.show_date as string,
      show_location: dbPastResult.show_location as string || undefined,
      class_name: dbPastResult.class_name as string,
      class_level: dbPastResult.class_level as string || undefined,
      placement: dbPastResult.placement as string || undefined,
      score: dbPastResult.score as string || undefined,
      qualified: dbPastResult.qualified as boolean,
      judge_name: dbPastResult.judge_name as string || undefined,
      notes: dbPastResult.notes as string || undefined,
      imported_from: dbPastResult.imported_from as string || undefined,
      external_id: dbPastResult.external_id as string || undefined,
      created_at: dbPastResult.created_at as string,
      updated_at: dbPastResult.updated_at as string
    };
  },

  // Map app past result to database format
  toDatabase(pastResult: CreatePastResultData) {
    return {
      dog_id: pastResult.dog_id,
      show_id: pastResult.show_id || null,
      show_name: pastResult.show_name,
      show_date: pastResult.show_date,
      show_location: pastResult.show_location || null,
      class_name: pastResult.class_name,
      class_level: pastResult.class_level || null,
      placement: pastResult.placement || null,
      score: pastResult.score || null,
      qualified: pastResult.qualified,
      judge_name: pastResult.judge_name || null,
      notes: pastResult.notes || null,
      imported_from: pastResult.imported_from || null,
      external_id: pastResult.external_id || null
    };
  },

  // Validate past result data
  validate(data: CreatePastResultData): string[] {
    const errors: string[] = [];

    if (!data.dog_id) {
      errors.push('Dog ID is required');
    }

    if (!data.show_name) {
      errors.push('Show name is required');
    }

    if (!data.show_date) {
      errors.push('Show date is required');
    } else {
      const date = new Date(data.show_date);
      if (isNaN(date.getTime())) {
        errors.push('Invalid date format');
      }
    }

    if (!data.class_name) {
      errors.push('Class name is required');
    }

    return errors;
  }
};

// Import/Export Mappers
export const importMappers = {
  // Convert import data to achievement
  achievementFromImport(importData: ImportAchievementData, dogId: string): CreateAchievementData {
    return {
      dog_id: dogId,
      achievement_type: importData.achievement_type,
      title: importData.title,
      organization: importData.organization,
      date_earned: importData.date_earned,
      notes: importData.source ? `Imported from ${importData.source}` : undefined
    };
  },

  // Convert import data to competition
  competitionFromImport(importData: ImportCompetitionData, dogId: string): CreateCompetitionData {
    return {
      dog_id: dogId,
      competition_name: importData.competition_name,
      competition_date: importData.competition_date,
      placement: importData.placement,
      score: importData.score,
      qualified: importData.qualified,
      organization: importData.organization,
      notes: importData.source ? `Imported from ${importData.source}` : undefined
    };
  },

  // Validate import data
  validateAchievementImport(data: ImportAchievementData): string[] {
    const errors: string[] = [];

    if (!data.dog_identifier) {
      errors.push('Dog identifier is required');
    }

    if (!data.achievement_type) {
      errors.push('Achievement type is required');
    }

    if (!data.title) {
      errors.push('Title is required');
    }

    if (!data.organization) {
      errors.push('Organization is required');
    }

    if (!data.date_earned) {
      errors.push('Date earned is required');
    }

    return errors;
  },

  validateCompetitionImport(data: ImportCompetitionData): string[] {
    const errors: string[] = [];

    if (!data.dog_identifier) {
      errors.push('Dog identifier is required');
    }

    if (!data.competition_name) {
      errors.push('Competition name is required');
    }

    if (!data.competition_date) {
      errors.push('Competition date is required');
    }

    return errors;
  }
};

// Organization and Discipline Configuration
export const organizationConfigs: Record<string, OrganizationConfig> = {
  AKC: {
    name: 'American Kennel Club',
    abbreviation: 'AKC',
    achievement_types: ['Championship', 'Title', 'Certificate'],
    disciplines: ['Conformation', 'Obedience', 'Rally', 'Agility', 'Tracking'],
    levels: ['Novice', 'Open', 'Utility', 'Master'],
    scoring_system: 'qualified',
    website: 'https://www.akc.org'
  },
  UKC: {
    name: 'United Kennel Club',
    abbreviation: 'UKC',
    achievement_types: ['Championship', 'Title', 'Award'],
    disciplines: ['Conformation', 'Obedience', 'Rally', 'Agility'],
    levels: ['Started', 'Advanced', 'Superior'],
    scoring_system: 'points',
    website: 'https://www.ukcdogs.com'
  },
  USDAA: {
    name: 'United States Dog Agility Association',
    abbreviation: 'USDAA',
    achievement_types: ['Title', 'Certificate', 'Award'],
    disciplines: ['Agility'],
    levels: ['Starters', 'Advanced', 'Masters', 'Performance'],
    scoring_system: 'time',
    website: 'https://www.usdaa.com'
  }
};

export const disciplineConfigs: Record<string, DisciplineConfig> = {
  Agility: {
    name: 'Agility',
    abbreviation: 'AG',
    scoring_type: 'time',
    levels: ['Novice', 'Open', 'Excellent', 'Master'],
    organizations: ['AKC', 'UKC', 'USDAA', 'CPE', 'NADAC']
  },
  Obedience: {
    name: 'Obedience',
    abbreviation: 'OB',
    scoring_type: 'points',
    levels: ['Novice', 'Open', 'Utility'],
    organizations: ['AKC', 'UKC', 'CKC']
  },
  Rally: {
    name: 'Rally',
    abbreviation: 'RA',
    scoring_type: 'points',
    levels: ['Novice', 'Advanced', 'Excellent', 'Master'],
    organizations: ['AKC', 'UKC']
  },
  Conformation: {
    name: 'Conformation',
    abbreviation: 'CH',
    scoring_type: 'placement',
    levels: ['Class', 'Major', 'Specialty'],
    organizations: ['AKC', 'UKC', 'CKC']
  }
};

// Utility Functions
export const achievementUtils = {
  // Get organization config
  getOrganizationConfig(organization: string): OrganizationConfig | undefined {
    return organizationConfigs[organization];
  },

  // Get discipline config
  getDisciplineConfig(discipline: string): DisciplineConfig | undefined {
    return disciplineConfigs[discipline];
  },

  // Get valid achievement types for organization
  getValidAchievementTypes(organization: string): string[] {
    const config = this.getOrganizationConfig(organization);
    return config ? config.achievement_types : ACHIEVEMENT_TYPES.slice();
  },

  // Get valid disciplines for organization
  getValidDisciplines(organization: string): string[] {
    const config = this.getOrganizationConfig(organization);
    return config ? config.disciplines : DISCIPLINES.slice();
  },

  // Check if a placement is a qualifying score
  isQualifyingPlacement(placement: string): boolean {
    const qualifyingPlacements = ['1st', '2nd', '3rd', '4th', 'Q'];
    return qualifyingPlacements.includes(placement);
  },

  // Calculate points based on placement and organization
  calculatePoints(placement: string, organization: string, level?: string): number {
    const config = this.getOrganizationConfig(organization);
    if (!config) return 0;

    // Basic point calculation - can be enhanced based on specific org rules
    const basePoints: Record<string, number> = {
      '1st': 5,
      '2nd': 3,
      '3rd': 2,
      '4th': 1,
      'Q': 1
    };

    const levelMultiplier = level === 'Master' ? 2 : level === 'Advanced' ? 1.5 : 1;
    return (basePoints[placement] || 0) * levelMultiplier;
  },

  // Format achievement title with abbreviation
  formatAchievementTitle(achievement: Achievement): string {
    if (achievement.abbreviation) {
      return `${achievement.title} (${achievement.abbreviation})`;
    }
    return achievement.title;
  },

  // Sort achievements by importance (championships first, then by date)
  sortAchievementsByImportance(achievements: Achievement[]): Achievement[] {
    return achievements.sort((a, b) => {
      // Championships first
      if (a.achievement_type === 'Championship' && b.achievement_type !== 'Championship') {
        return -1;
      }
      if (b.achievement_type === 'Championship' && a.achievement_type !== 'Championship') {
        return 1;
      }
      
      // Then by date (newest first)
      return b.date_earned.localeCompare(a.date_earned);
    });
  }
};