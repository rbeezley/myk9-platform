/**
 * Achievement Database Queries
 *
 * Database operations for tracking dog achievements and titles
 * across multiple organizations and disciplines.
 */

import { supabase } from '../supabaseClient';

import {
  Achievement,
  CreateAchievementData,
  UpdateAchievementData,
  AchievementFilters,
  AchievementSummary,
} from '../../../types/achievement';

// Achievement Operations
export const achievementQueries = {
  // Create new achievement
  async create(data: CreateAchievementData): Promise<Achievement> {
    // Build insert object with required fields, adding optional fields only when defined
    // to satisfy exactOptionalPropertyTypes
    const insertData = {
      dog_id: data.dog_id,
      title: data.title,
      ...(data.organization !== undefined && { organization: data.organization }),
      ...(data.date_earned !== undefined && { date_earned: data.date_earned }),
      ...(data.certificate_number !== undefined && { certificate_number: data.certificate_number }),
      ...(data.notes !== undefined && { notes: data.notes }),
    };

    const { data: achievement, error } = await supabase
      .from('achievements')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create achievement: ${error.message}`);
    }

    return achievement as unknown as Achievement;
  },

  // Get achievement by ID
  async getById(id: string): Promise<Achievement | null> {
    const { data: achievement, error } = await supabase
      .from('achievements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch achievement: ${error.message}`);
    }

    return achievement as unknown as Achievement;
  },

  // Get all achievements for a dog
  async getByDogId(dogId: string, filters?: AchievementFilters): Promise<Achievement[]> {
    let query = supabase
      .from('achievements')
      .select('*')
      .eq('dog_id', dogId);

    // Apply filters (only for columns that exist in the database schema)
    if (filters?.organization) {
      query = query.eq('organization', filters.organization);
    }
    // Note: achievement_type, discipline, level, is_active columns don't exist in DB
    // Filter in memory if needed after fetching
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

    return (achievements || []) as unknown as Achievement[];
  },

  // Update achievement
  async update(data: UpdateAchievementData): Promise<Achievement> {
    const { id, ...updateData } = data;
    // Map to database columns (updated_at doesn't exist in DB schema)
    const dbUpdate: Record<string, unknown> = {};
    if ('title' in updateData) dbUpdate.title = updateData.title;
    if ('organization' in updateData) dbUpdate.organization = updateData.organization;
    if ('sport' in updateData) dbUpdate.sport = updateData.sport;
    if ('date_earned' in updateData) dbUpdate.date_earned = updateData.date_earned;
    if ('certificate_number' in updateData) dbUpdate.certificate_number = updateData.certificate_number;
    if ('notes' in updateData) dbUpdate.notes = updateData.notes;

    const { data: achievement, error } = await supabase
      .from('achievements')
      .update(dbUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update achievement: ${error.message}`);
    }

    return achievement as unknown as Achievement;
  },

  // Delete achievement
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('achievements')
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
      // is_active doesn't exist in DB schema, count all as active
      active_achievements: achievements.length,
      organizations: [...new Set(achievements.map((a: Achievement) => a.organization).filter(Boolean) as string[])],
      latest_achievement: achievements[0], // Already sorted by date desc
      achievements_by_type: {},
      achievements_by_organization: {}
    };

    // Calculate distributions
    achievements.forEach((achievement: Achievement) => {
      const achievementType = achievement.achievement_type || 'Unknown';
      summary.achievements_by_type[achievementType] =
        (summary.achievements_by_type[achievementType] || 0) + 1;

      const org = achievement.organization || 'Unknown';
      summary.achievements_by_organization[org] =
        (summary.achievements_by_organization[org] || 0) + 1;
    });

    return summary;
  }
};
