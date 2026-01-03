/**
 * Achievement and Competition Database Queries
 * 
 * Comprehensive database operations for tracking dog achievements, competitions,
 * and performance history across multiple organizations and disciplines.
 */

import { supabase } from '../supabaseClient';
import {
  Achievement,
  Competition,
  PastResult,
  CreateAchievementData,
  UpdateAchievementData,
  CreateCompetitionData,
  UpdateCompetitionData,
  CreatePastResultData,
  UpdatePastResultData,
  AchievementFilters,
  CompetitionFilters,
  PastResultFilters,
  AchievementSummary,
  CompetitionSummary,
  PerformanceStats
} from '../../../types/achievement';

// Achievement Operations
export const achievementQueries = {
  // Create new achievement
  async create(data: CreateAchievementData): Promise<Achievement> {
    const { data: achievement, error } = await supabase
      .from('achievement')
      .insert([data])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create achievement: ${error.message}`);
    }

    return achievement as Achievement;
  },

  // Get achievement by ID
  async getById(id: string): Promise<Achievement | null> {
    const { data: achievement, error } = await supabase
      .from('achievement')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch achievement: ${error.message}`);
    }

    return achievement as Achievement;
  },

  // Get all achievements for a dog
  async getByDogId(dogId: string, filters?: AchievementFilters): Promise<Achievement[]> {
    let query = supabase
      .from('achievement')
      .select('*')
      .eq('dog_id', dogId);

    // Apply filters
    if (filters?.organization) {
      query = query.eq('organization', filters.organization);
    }
    if (filters?.achievement_type) {
      query = query.eq('achievement_type', filters.achievement_type);
    }
    if (filters?.discipline) {
      query = query.eq('discipline', filters.discipline);
    }
    if (filters?.level) {
      query = query.eq('level', filters.level);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.date_from) {
      query = query.gte('date_earned', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('date_earned', filters.date_to);
    }

    query = query.order('date_earned', { ascending: false });

    const { data: achievements, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch achievements: ${error.message}`);
    }

    return (achievements || []) as Achievement[];
  },

  // Update achievement
  async update(data: UpdateAchievementData): Promise<Achievement> {
    const { id, ...updateData } = data;
    
    const { data: achievement, error } = await supabase
      .from('achievement')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update achievement: ${error.message}`);
    }

    return achievement as Achievement;
  },

  // Delete achievement
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('achievement')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete achievement: ${error.message}`);
    }
  },

  // Get achievement summary for a dog
  async getSummary(dogId: string): Promise<AchievementSummary> {
    const achievements = await this.getByDogId(dogId);
    
    const summary: AchievementSummary = {
      total_achievements: achievements.length,
      active_achievements: achievements.filter(a => a.is_active).length,
      organizations: [...new Set(achievements.map(a => a.organization).filter(Boolean) as string[])],
      latest_achievement: achievements[0], // Already sorted by date desc
      achievements_by_type: {},
      achievements_by_organization: {}
    };

    // Calculate distributions
    achievements.forEach(achievement => {
      summary.achievements_by_type[achievement.achievement_type] = 
        (summary.achievements_by_type[achievement.achievement_type] || 0) + 1;
      
      summary.achievements_by_organization[achievement.organization] = 
        (summary.achievements_by_organization[achievement.organization] || 0) + 1;
    });

    return summary;
  }
};

// Competition Operations
export const competitionQueries = {
  // Create new competition
  async create(data: CreateCompetitionData): Promise<Competition> {
    const { data: competition, error } = await supabase
      .from('competition')
      .insert([{ ...data, points_earned: data.points_earned || 0 }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create competition: ${error.message}`);
    }

    return competition as Competition;
  },

  // Get competition by ID
  async getById(id: string): Promise<Competition | null> {
    const { data: competition, error } = await supabase
      .from('competition')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch competition: ${error.message}`);
    }

    return competition as Competition;
  },

  // Get all competitions for a dog
  async getByDogId(dogId: string, filters?: CompetitionFilters): Promise<Competition[]> {
    let query = supabase
      .from('competition')
      .select('*')
      .eq('dog_id', dogId);

    // Apply filters
    if (filters?.organization) {
      query = query.eq('organization', filters.organization);
    }
    if (filters?.discipline) {
      query = query.eq('discipline', filters.discipline);
    }
    if (filters?.level) {
      query = query.eq('level', filters.level);
    }
    if (filters?.qualified !== undefined) {
      query = query.eq('qualified', filters.qualified);
    }
    if (filters?.show_id) {
      query = query.eq('show_id', filters.show_id);
    }
    if (filters?.date_from) {
      query = query.gte('competition_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('competition_date', filters.date_to);
    }
    if (filters?.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }

    query = query.order('competition_date', { ascending: false });

    const { data: competitions, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch competitions: ${error.message}`);
    }

    return (competitions || []) as Competition[];
  },

  // Update competition
  async update(data: UpdateCompetitionData): Promise<Competition> {
    const { id, ...updateData } = data;
    
    const { data: competition, error } = await supabase
      .from('competition')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update competition: ${error.message}`);
    }

    return competition as Competition;
  },

  // Delete competition
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('competition')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete competition: ${error.message}`);
    }
  },

  // Get competition summary for a dog
  async getSummary(dogId: string): Promise<CompetitionSummary> {
    const competitions = await this.getByDogId(dogId);
    
    const qualifiedCompetitions = competitions.filter(c => c.qualified === true);
    const totalPoints = competitions.reduce((sum, c) => sum + (c.points_earned || 0), 0);
    
    // Calculate average score for numeric scores
    const numericScores = competitions
      .map(c => parseFloat(c.score || '0'))
      .filter(score => !isNaN(score));
    
    const summary: CompetitionSummary = {
      total_competitions: competitions.length,
      qualified_competitions: qualifiedCompetitions.length,
      qualification_rate: competitions.length > 0 ? 
        qualifiedCompetitions.length / competitions.length : 0,
      total_points: totalPoints,
      average_score: numericScores.length > 0 ? 
        numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length : undefined,
      best_placement: this.getBestPlacement(competitions),
      recent_competitions: competitions.slice(0, 5), // Last 5 competitions
      organizations: [...new Set(competitions.map(c => c.organization).filter(Boolean) as string[])],
      disciplines: [...new Set(competitions.map(c => c.discipline).filter(Boolean) as string[])]
    };

    return summary;
  },

  // Helper function to determine best placement
  getBestPlacement(competitions: Competition[]): string | undefined {
    const placements = competitions
      .map(c => c.placement)
      .filter(Boolean);
    
    if (placements.length === 0) return undefined;
    
    // Sort placements, prioritizing numeric placements
    const sortedPlacements = placements.sort((a, b) => {
      const aNum = parseInt(a?.replace(/[^\d]/g, '') || '999');
      const bNum = parseInt(b?.replace(/[^\d]/g, '') || '999');
      return aNum - bNum;
    });
    
    return sortedPlacements[0];
  }
};

// Past Results Operations
export const pastResultQueries = {
  // Create new past result
  async create(data: CreatePastResultData): Promise<PastResult> {
    const { data: pastResult, error } = await supabase
      .from('past_result')
      .insert([data])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create past result: ${error.message}`);
    }

    return pastResult as PastResult;
  },

  // Get past result by ID
  async getById(id: string): Promise<PastResult | null> {
    const { data: pastResult, error } = await supabase
      .from('past_result')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch past result: ${error.message}`);
    }

    return pastResult as PastResult;
  },

  // Get all past results for a dog
  async getByDogId(dogId: string, filters?: PastResultFilters): Promise<PastResult[]> {
    let query = supabase
      .from('past_result')
      .select('*')
      .eq('dog_id', dogId);

    // Apply filters
    if (filters?.show_name) {
      query = query.ilike('show_name', `%${filters.show_name}%`);
    }
    if (filters?.class_name) {
      query = query.ilike('class_name', `%${filters.class_name}%`);
    }
    if (filters?.class_level) {
      query = query.eq('class_level', filters.class_level);
    }
    if (filters?.qualified !== undefined) {
      query = query.eq('qualified', filters.qualified);
    }
    if (filters?.judge_name) {
      query = query.ilike('judge_name', `%${filters.judge_name}%`);
    }
    if (filters?.date_from) {
      query = query.gte('show_date', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('show_date', filters.date_to);
    }
    if (filters?.imported_from) {
      query = query.eq('imported_from', filters.imported_from);
    }

    query = query.order('show_date', { ascending: false });

    const { data: pastResults, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch past results: ${error.message}`);
    }

    return (pastResults || []) as PastResult[];
  },

  // Update past result
  async update(data: UpdatePastResultData): Promise<PastResult> {
    const { id, ...updateData } = data;
    
    const { data: pastResult, error } = await supabase
      .from('past_result')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update past result: ${error.message}`);
    }

    return pastResult as PastResult;
  },

  // Delete past result
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('past_result')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete past result: ${error.message}`);
    }
  },

  // Batch import past results
  async batchImport(results: CreatePastResultData[]): Promise<PastResult[]> {
    const { data: pastResults, error } = await supabase
      .from('past_result')
      .insert(results)
      .select();

    if (error) {
      throw new Error(`Failed to import past results: ${error.message}`);
    }

    return (pastResults || []) as PastResult[];
  }
};

// Combined Analytics Operations
export const performanceQueries = {
  // Get comprehensive performance stats for a dog
  async getPerformanceStats(dogId: string): Promise<PerformanceStats> {
    const [achievementSummary, competitionSummary] = await Promise.all([
      achievementQueries.getSummary(dogId),
      competitionQueries.getSummary(dogId)
    ]);

    // Get performance trend data (last 12 months)
    const competitions = await competitionQueries.getByDogId(dogId, {
      date_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    const performanceTrend = this.calculatePerformanceTrend(competitions);
    const careerHighlights = await this.getCareerHighlights(dogId);

    return {
      achievement_summary: achievementSummary,
      competition_summary: competitionSummary,
      performance_trend: performanceTrend,
      career_highlights: careerHighlights
    };
  },

  // Calculate monthly performance trend
  calculatePerformanceTrend(competitions: Competition[]) {
    const monthlyStats: Record<string, { competitions: number; qualified: number; points: number }> = {};
    
    competitions.forEach(competition => {
      const month = competition.competition_date.substring(0, 7); // YYYY-MM
      
      if (!monthlyStats[month]) {
        monthlyStats[month] = { competitions: 0, qualified: 0, points: 0 };
      }
      
      monthlyStats[month].competitions++;
      if (competition.qualified) {
        monthlyStats[month].qualified++;
      }
      monthlyStats[month].points += competition.points_earned || 0;
    });

    return Object.entries(monthlyStats)
      .map(([month, stats]) => ({ month, ...stats }))
      .sort((a, b) => a.month.localeCompare(b.month));
  },

  // Get career highlights
  async getCareerHighlights(dogId: string) {
    const [achievements, competitions] = await Promise.all([
      achievementQueries.getByDogId(dogId),
      competitionQueries.getByDogId(dogId)
    ]);

    // Find first achievement (oldest by date)
    const firstAchievement = achievements
      .sort((a, b) => a.date_earned.localeCompare(b.date_earned))[0];

    // Find highest scoring competition
    const highestScoringCompetition = competitions
      .filter(c => c.score && !isNaN(parseFloat(c.score)))
      .sort((a, b) => parseFloat(b.score!) - parseFloat(a.score!))[0];

    // Find most recent title
    const mostRecentTitle = achievements
      .filter(a => a.achievement_type === 'Title')
      .sort((a, b) => b.date_earned.localeCompare(a.date_earned))[0];

    // Calculate qualification streak
    const qualificationStreak = this.calculateQualificationStreak(competitions);

    return {
      first_achievement: firstAchievement,
      highest_scoring_competition: highestScoringCompetition,
      most_recent_title: mostRecentTitle,
      qualification_streak: qualificationStreak
    };
  },

  // Calculate current qualification streak
  calculateQualificationStreak(competitions: Competition[]): number {
    const sortedCompetitions = competitions
      .sort((a, b) => b.competition_date.localeCompare(a.competition_date));
    
    let streak = 0;
    for (const competition of sortedCompetitions) {
      if (competition.qualified === true) {
        streak++;
      } else if (competition.qualified === false) {
        break; // Streak broken
      }
      // Ignore null/undefined qualified status
    }
    
    return streak;
  }
};