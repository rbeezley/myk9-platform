/**
 * ReplicatedClassRequirementsTable - Offline-first class requirements replication
 *
 * Manages organization-specific class requirements (time limits, fault rules, etc.)
 * with offline support for scoresheet configuration.
 *
 * Conflict Resolution:
 * - Server-authoritative: All class requirements come from server
 * - Use case: Admins configure requirements, no client conflicts
 *
 * **Phase 3 Day 14** - Core table migration
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface ClassRequirement {
  id: string;
  organization: string;
  element: string;
  level: string;
  section?: string;

  // Time limits
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  has_30_second_warning?: boolean;

  // Scoring rules
  time_type?: string; // 'fastest' | 'slowest' | 'combined'
  max_time_faults?: number;
  max_faults_allowed?: number;

  // Area configuration
  area_count?: number;
  requires_all_areas?: boolean;

  // Qualifications
  qualifying_score?: number;
  title_points?: number;

  // Configuration
  allow_excused?: boolean;
  allow_absent?: boolean;
  require_judge_signature?: boolean;

  // Note: class_requirements is organization-level config (no license_key)
  created_at?: string;
  updated_at?: string;
}

export class ReplicatedClassRequirementsTable extends ReplicatedTable<ClassRequirement> {
  constructor() {
    super('class_requirements'); // TTL managed by feature flags
  }

  /**
   * Sync class requirements from Supabase
   */
  async sync(_licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();
      const lastSync = metadata?.lastIncrementalSyncAt || 0;

      logger.log(
        `[${this.tableName}] Starting incremental sync (since ${new Date(lastSync).toISOString()})...`
      );

      // Fetch requirements updated since last sync
      // Note: class_requirements is organization-level config (AKC, UKC, ASCA)
      // It has NO license_key - sync ALL requirements for all organizations
      const { data: remoteRequirements, error } = await supabase
        .from('class_requirements')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteRequirements || remoteRequirements.length === 0) {
        logger.log(`[${this.tableName}] No updates found`);

        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
          errorMessage: undefined,
        });

        return {
          tableName: this.tableName,
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Process each requirement
      for (const remoteRequirement of remoteRequirements) {
        // Convert ID to string for consistent IndexedDB key format
        const requirementId = String(remoteRequirement.id);
        const localRequirement = await this.get(requirementId);

        if (localRequirement) {
          // Conflict resolution: server always wins for requirements
          const resolved = this.resolveConflict(localRequirement, remoteRequirement);
          await this.set(requirementId, resolved);
          conflictsResolved++;
        } else {
          // New requirement
          await this.set(requirementId, remoteRequirement);
        }

        rowsSynced++;
      }

      // Update sync metadata
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: (metadata?.conflictCount || 0) + conflictsResolved,
      });

      const duration = Date.now() - startTime;
      logger.log(
        `[${this.tableName}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`
      );

      return {
        tableName: this.tableName,
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      // Update sync metadata with error
      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

      logger.error(`[${this.tableName}] Sync failed:`, error);

      return {
        tableName: this.tableName,
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution: Server-authoritative
   * Class requirements always come from server (admin configured)
   */
  protected resolveConflict(_local: ClassRequirement, remote: ClassRequirement): ClassRequirement {
    // Server always wins for class requirements
    // Admins configure on server, no client conflicts
    return remote;
  }

  /**
   * Get requirement by organization, element, and level
   * Most common query pattern for scoresheets
   */
  async getRequirement(
    organization: string,
    element: string,
    level: string,
    section?: string
  ): Promise<ClassRequirement | null> {
    const allRequirements = await this.getAll();

    // Find exact match with section if provided
    if (section) {
      const exactMatch = allRequirements.find(
        (req) =>
          req.organization === organization &&
          req.element === element &&
          req.level === level &&
          req.section === section
      );
      if (exactMatch) return exactMatch;
    }

    // Fall back to match without section
    const match = allRequirements.find(
      (req) =>
        req.organization === organization &&
        req.element === element &&
        req.level === level &&
        !req.section
    );

    return match || null;
  }

  /**
   * Get all requirements for an organization
   */
  async getByOrganization(organization: string): Promise<ClassRequirement[]> {
    const allRequirements = await this.getAll();
    return allRequirements
      .filter((req) => req.organization === organization)
      .sort((a, b) => {
        // Sort by element, then level
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        return a.level.localeCompare(b.level);
      });
  }

  /**
   * Get all requirements for an element (e.g., "Scent Work")
   */
  async getByElement(element: string): Promise<ClassRequirement[]> {
    const allRequirements = await this.getAll();
    return allRequirements
      .filter((req) => req.element === element)
      .sort((a, b) => a.level.localeCompare(b.level));
  }

  /**
   * Check if a requirement exists for a specific class configuration
   */
  async hasRequirement(
    organization: string,
    element: string,
    level: string
  ): Promise<boolean> {
    const requirement = await this.getRequirement(organization, element, level);
    return requirement !== null;
  }
}

// Singleton export
export const replicatedClassRequirementsTable = new ReplicatedClassRequirementsTable();
