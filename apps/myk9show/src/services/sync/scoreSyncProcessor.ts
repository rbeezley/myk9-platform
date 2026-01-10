/**
 * Score Sync Processor
 *
 * Handles synchronization of scoring data between local storage and Supabase.
 * Processes create, update, and delete operations for entry scores.
 *
 * Key Responsibilities:
 * - Sync local scores to Supabase entries table
 * - Handle version-based conflict detection
 * - Update local cache with server-confirmed data
 * - Support offline-first workflow
 */

import { supabase } from '@/lib/supabase';
import type { SyncQueueItem } from '@/types/sync-types';
import type { BaseScore, QualificationStatus } from '@/types/scoring-types';
import type { SyncProcessor, SyncProcessorResult } from './types/processor';
import { offlineScoringService } from '../scoring/OfflineScoringService';

/**
 * Maps BaseScore qualification status to database result_status
 */
function qualificationToResultStatus(qualification: string): string {
  const mapping: Record<string, string> = {
    'Q': 'qualified',
    'qualified': 'qualified',
    'NQ': 'nq',
    'nq': 'nq',
    'ABS': 'absent',
    'absent': 'absent',
    'EX': 'excused',
    'excused': 'excused',
    'WD': 'withdrawn',
    'withdrawn': 'withdrawn',
  };
  return mapping[qualification] || 'pending';
}

/**
 * Maps database result_status to BaseScore qualification
 */
function resultStatusToQualification(resultStatus: string): QualificationStatus {
  const mapping: Record<string, QualificationStatus> = {
    'qualified': 'Qualified',
    'nq': 'Not Qualified',
    'absent': 'Absent',
    'excused': 'Excused',
    'withdrawn': 'Withdrawn',
    'pending': 'Not Qualified', // Default or sensible fallback
  };
  return mapping[resultStatus] || 'Not Qualified';
}

/**
 * Converts BaseScore data to entries table update format
 */
function scoreToEntryUpdate(score: BaseScore): Record<string, unknown> {
  return {
    // Scoring state
    is_scored: true,
    result_status: qualificationToResultStatus(score.qualification),

    // Timing
    search_time_seconds: score.time || 0,
    scoring_completed_at: new Date().toISOString(),

    // Scoring values
    points_earned: score.points || 0,
    total_faults: score.faults || 0,

    // Placement
    final_placement: score.placement || 0,

    // Judge info
    judge_notes: score.judgeNotes || null,

    // Sync metadata
    sync_version: score.version,
    last_synced_at: new Date().toISOString(),
    local_id: score.id || null,
  };
}

/**
 * Converts entries table row back to BaseScore format
 */
function entryToScore(entry: Record<string, unknown>, originalScore: BaseScore): BaseScore {
  return {
    ...originalScore,
    id: entry.id as string,
    qualification: resultStatusToQualification(entry.result_status as string),
    time: (entry.search_time_seconds as number) || 0,
    points: (entry.points_earned as number) || 0,
    faults: (entry.total_faults as number) || 0,
    placement: (entry.final_placement as number) || 0,
    judgeNotes: (entry.judge_notes as string) || undefined,
    version: (entry.sync_version as number) || 0,
    syncStatus: 'synced',
    lastModified: entry.updated_at ? new Date(entry.updated_at as string) : new Date(),
  };
}

export class ScoreSyncProcessor implements SyncProcessor {
  entityType = 'entry';

  canProcess(entityType: string): boolean {
    return entityType === 'entry';
  }

  async processItem(item: SyncQueueItem): Promise<SyncProcessorResult> {
    switch (item.actionType) {
      case 'create':
        return this.createScore(item);
      case 'update':
        return this.updateScore(item);
      case 'delete':
        return this.deleteScore(item);
      default:
        return {
          success: false,
          error: new Error(`Unknown action type: ${item.actionType}`),
        };
    }
  }

  /**
   * Create a new score in Supabase
   */
  private async createScore(item: SyncQueueItem): Promise<SyncProcessorResult> {
    const scoreData = item.data as unknown as BaseScore;
    const entryId = scoreData.entryId;

    try {
      // Check if entry already has a score (might have been created by another device)
      const { data: existingEntry, error: fetchError } = await supabase
        .from('entries')
        .select('id, sync_version, is_scored, result_status')
        .eq('id', entryId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (!existingEntry) {
        return {
          success: false,
          error: new Error(`Entry ${entryId} not found`),
        };
      }

      // If already scored, treat as update instead
      if (existingEntry.is_scored) {
        return this.updateScore(item);
      }

      // Apply the score to the entry
      const updateData = scoreToEntryUpdate(scoreData);

      const { data: updatedEntry, error: updateError } = await supabase
        .from('entries')
        .update(updateData)
        .eq('id', entryId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Update local cache with server data
      if (scoreData.id) {
        const serverScore = entryToScore(updatedEntry, scoreData);
        await offlineScoringService.updateCacheWithServerData(scoreData.id, serverScore);
      }

      return {
        success: true,
        serverData: updatedEntry,
        serverVersion: updatedEntry.sync_version,
      };
    } catch (error) {
      console.error('Failed to create score:', error);
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Update an existing score in Supabase
   */
  private async updateScore(item: SyncQueueItem): Promise<SyncProcessorResult> {
    const scoreData = item.data as unknown as BaseScore;
    const entryId = scoreData.entryId;

    try {
      // Fetch current server version for conflict detection
      const { data: currentEntry, error: fetchError } = await supabase
        .from('entries')
        .select('id, sync_version, is_scored, result_status, updated_at')
        .eq('id', entryId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (!currentEntry) {
        return {
          success: false,
          error: new Error(`Entry ${entryId} not found`),
        };
      }

      // Check for version conflict
      const serverVersion = currentEntry.sync_version || 0;
      const localVersion = scoreData.version || 0;

      if (serverVersion > localVersion) {
        // Server has newer version - conflict detected
        return {
          success: false,
          conflictDetected: true,
          serverVersion,
          serverData: currentEntry,
          error: new Error(`Version conflict: server v${serverVersion} vs local v${localVersion}`),
        };
      }

      // Apply the update with incremented version
      const updateData = {
        ...scoreToEntryUpdate(scoreData),
        sync_version: serverVersion + 1,
      };

      const { data: updatedEntry, error: updateError } = await supabase
        .from('entries')
        .update(updateData)
        .eq('id', entryId)
        .eq('sync_version', serverVersion) // Optimistic locking
        .select()
        .single();

      if (updateError) {
        // Check if it's a conflict (row was updated by another client)
        if (updateError.code === 'PGRST116') {
          return {
            success: false,
            conflictDetected: true,
            error: new Error('Concurrent update conflict'),
          };
        }
        throw updateError;
      }

      // Update local cache with server data
      if (scoreData.id) {
        const serverScore = entryToScore(updatedEntry, scoreData);
        await offlineScoringService.updateCacheWithServerData(scoreData.id, serverScore);
      }

      return {
        success: true,
        serverData: updatedEntry,
        serverVersion: updatedEntry.sync_version,
      };
    } catch (error) {
      console.error('Failed to update score:', error);
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Delete/clear a score in Supabase
   */
  private async deleteScore(item: SyncQueueItem): Promise<SyncProcessorResult> {
    const scoreData = item.data as unknown as { entryId: string; classId: string; judgeId: string };
    const entryId = scoreData.entryId;

    try {
      // Clear scoring fields (don't delete the entry, just reset scoring state)
      const { data: updatedEntry, error } = await supabase
        .from('entries')
        .update({
          is_scored: false,
          result_status: 'pending',
          search_time_seconds: 0,
          points_earned: 0,
          total_faults: 0,
          final_placement: 0,
          judge_notes: null,
          scoring_completed_at: null,
          sync_version: supabase.rpc ? undefined : 1, // Increment if possible
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', entryId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        serverData: updatedEntry,
      };
    } catch (error) {
      console.error('Failed to delete score:', error);
      return {
        success: false,
        error: error as Error,
      };
    }
  }
}

// Singleton instance
export const scoreSyncProcessor = new ScoreSyncProcessor();
