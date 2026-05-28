/**
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
import type { TablesUpdate } from '@/types/supabase';

export async function createAchievement(data: CreateAchievementData): Promise<Achievement> {
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
}

export async function getAchievementById(id: string): Promise<Achievement | null> {
  const { data: achievement, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch achievement: ${error.message}`);
  }

  return achievement as unknown as Achievement;
}

export async function getAchievementsByDogId(
  dogId: string,
  filters?: AchievementFilters
): Promise<Achievement[]> {
  let query = supabase.from('achievements').select('*').eq('dog_id', dogId);

  if (filters?.organization) {
    query = query.eq('organization', filters.organization);
  }
  // Note: achievement_type, discipline, level, is_active columns don't exist in DB
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
}

export async function updateAchievement(data: UpdateAchievementData): Promise<Achievement> {
  const { id, ...updateData } = data;
  // updated_at doesn't exist in DB schema
  const dbUpdate: TablesUpdate<'achievements'> = {};
  if (updateData.title !== undefined) dbUpdate.title = updateData.title;
  if (updateData.organization !== undefined) dbUpdate.organization = updateData.organization;
  if ('sport' in updateData && typeof updateData.sport === 'string') dbUpdate.sport = updateData.sport;
  if (updateData.date_earned !== undefined) dbUpdate.date_earned = updateData.date_earned;
  if (updateData.certificate_number !== undefined)
    dbUpdate.certificate_number = updateData.certificate_number;
  if (updateData.notes !== undefined) dbUpdate.notes = updateData.notes;

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
}

export async function deleteAchievement(id: string): Promise<void> {
  const { error } = await supabase.from('achievements').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete achievement: ${error.message}`);
  }
}

export async function getAchievementSummary(dogId: string): Promise<AchievementSummary> {
  const achievements = await getAchievementsByDogId(dogId);

  const summary: AchievementSummary = {
    total_achievements: achievements.length,
    // is_active doesn't exist in DB schema; count all as active
    active_achievements: achievements.length,
    organizations: [
      ...new Set(achievements.map((a: Achievement) => a.organization).filter(Boolean) as string[]),
    ],
    latest_achievement: achievements[0],
    achievements_by_type: {},
    achievements_by_organization: {},
  };

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
