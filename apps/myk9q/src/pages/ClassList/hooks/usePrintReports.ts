/**
 * usePrintReports Hook
 *
 * Manages check-in and results sheet generation for classes.
 * Handles data fetching, validation, and report generation.
 *
 * Extracted from ClassList.tsx
 */

import { useCallback } from 'react';
import { generateCheckInSheet, generateResultsSheet, generateScoresheetReport, type ReportClassInfo, type ScoresheetClassInfo } from '@/services/reportService';
import { getClassEntries } from '@/services/entryService';
import { parseOrganizationData } from '@/utils/organizationUtils';
import { supabase } from '@/lib/supabase';
import type { ClassEntry, TrialInfo } from './useClassListData';
import type { Entry } from '@/stores/entryStore';
import { logger } from '@/utils/logger';

/**
 * Result type for report operations
 */
export interface ReportOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Dependencies for report operations - grouped to reduce parameter count
 */
export interface ReportDependencies {
  classes: ClassEntry[];
  trialInfo: TrialInfo | null;
  licenseKey: string;
  organization: string;
  onComplete?: () => void;
}

/**
 * Hook return type
 */
export interface UsePrintReportsReturn {
  handleGenerateCheckIn: (
    classId: number,
    deps: ReportDependencies
  ) => Promise<ReportOperationResult>;
  handleGenerateResults: (
    classId: number,
    deps: ReportDependencies
  ) => Promise<ReportOperationResult>;
  handleGenerateScoresheet: (
    classId: number,
    deps: ReportDependencies
  ) => Promise<ReportOperationResult>;
}

/**
 * Custom hook for managing print report generation
 *
 * Provides methods for:
 * - **Check-In Sheet**: Generate printable check-in sheet for class
 * - **Results Sheet**: Generate printable results sheet with scored entries only
 * - **Data Fetching**: Automatically fetches class entries from database
 * - **Validation**: Checks for required data before generating reports
 * - **Organization Data**: Parses organization info for header
 *
 * **Check-In Sheet**: Shows all entries with check-in boxes
 * **Results Sheet**: Shows only scored entries with placements/times
 * **Validation**: Results sheet validates that scored entries exist
 *
 * @returns Report generation methods
 *
 * @example
 * ```tsx
 * function ClassList() {
 *   const { handleGenerateCheckIn, handleGenerateResults } = usePrintReports();
 *
 *   // Create deps object once
 *   const reportDeps = { classes, trialInfo, licenseKey, organization, onComplete: closePopup };
 *
 *   const printCheckIn = async (classId: number) => {
 *     const result = await handleGenerateCheckIn(classId, reportDeps);
 *     if (!result.success) {
 *       alert(result.error);
 *     }
 *   };
 *
 *   const printResults = async (classId: number) => {
 *     const result = await handleGenerateResults(classId, reportDeps);
 *     if (!result.success) {
 *       alert(result.error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={() => printCheckIn(1)}>Check-In Sheet</button>
 *       <button onClick={() => printResults(1)}>Results Sheet</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePrintReports(): UsePrintReportsReturn {
  /**
   * Generate check-in sheet for class
   * Includes all entries with check-in boxes
   */
  const handleGenerateCheckIn = useCallback(async (
    classId: number,
    deps: ReportDependencies
  ): Promise<ReportOperationResult> => {
    const { classes, trialInfo, licenseKey, organization, onComplete } = deps;

    try {
      const classData = classes.find(c => c.id === classId);
      if (!classData) {
        return {
          success: false,
          error: 'Class not found'
        };
      }

      if (!licenseKey) {
        return {
          success: false,
          error: 'License key required'
        };
      }

      // Fetch entries for class
      const entries = await getClassEntries(classId, licenseKey);

      // Parse organization data for header
      const orgData = parseOrganizationData(organization);

      // Build report class info
      const reportClassInfo: ReportClassInfo = {
        className: classData.class_name || '',
        element: classData.element || '',
        level: classData.level || '',
        section: classData.section || '',
        trialDate: trialInfo?.trial_date || '',
        trialNumber: trialInfo?.trial_number?.toString() || '',
        judgeName: classData.judge_name || 'TBD',
        organization: orgData.organization,
        activityType: orgData.activity_type
      };

      // Generate check-in sheet
      generateCheckInSheet(reportClassInfo, entries);

      // Call completion callback (e.g., close popup)
      onComplete?.();

      return { success: true };
    } catch (error) {
      logger.error('Error generating check-in sheet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate check-in sheet'
      };
    }
  }, []);

  /**
   * Generate results sheet for class
   * Includes only scored entries with placements
   */
  const handleGenerateResults = useCallback(async (
    classId: number,
    deps: ReportDependencies
  ): Promise<ReportOperationResult> => {
    const { classes, trialInfo, licenseKey, organization, onComplete } = deps;

    try {
      const classData = classes.find(c => c.id === classId);
      if (!classData) {
        return {
          success: false,
          error: 'Class not found'
        };
      }

      if (!licenseKey) {
        return {
          success: false,
          error: 'License key required'
        };
      }

      // Fetch entries for class
      const entries = await getClassEntries(classId, licenseKey);

      // Filter to only scored entries
      const completedEntries = entries.filter((e: Entry) => e.isScored);

      if (completedEntries.length === 0) {
        onComplete?.();
        return {
          success: false,
          error: 'No scored entries to display in results sheet'
        };
      }

      // Parse organization data for header
      const orgData = parseOrganizationData(organization);

      // Build report class info
      const reportClassInfo: ReportClassInfo = {
        className: classData.class_name || '',
        element: classData.element || '',
        level: classData.level || '',
        section: classData.section || '',
        trialDate: trialInfo?.trial_date || '',
        trialNumber: trialInfo?.trial_number?.toString() || '',
        judgeName: classData.judge_name || 'TBD',
        organization: orgData.organization,
        activityType: orgData.activity_type
      };

      // Generate results sheet
      generateResultsSheet(reportClassInfo, entries);

      // Call completion callback (e.g., close popup)
      onComplete?.();

      return { success: true };
    } catch (error) {
      logger.error('Error generating results sheet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate results sheet'
      };
    }
  }, []);

  /**
   * Generate scoresheet for class
   * Blank scoresheet for judges to record scores during trial
   */
  const handleGenerateScoresheet = useCallback(async (
    classId: number,
    deps: ReportDependencies
  ): Promise<ReportOperationResult> => {
    const { classes, trialInfo, licenseKey, organization, onComplete } = deps;

    try {
      const classData = classes.find(c => c.id === classId);
      if (!classData) {
        return {
          success: false,
          error: 'Class not found'
        };
      }

      if (!licenseKey) {
        return {
          success: false,
          error: 'License key required'
        };
      }

      // Fetch entries for class
      const entries = await getClassEntries(classId, licenseKey);

      if (entries.length === 0) {
        onComplete?.();
        return {
          success: false,
          error: 'No entries to display in scoresheet'
        };
      }

      // Parse organization data for header
      const orgData = parseOrganizationData(organization);

      // Fetch class requirements from database (hides, distractions, etc.)
      // Skip for Master level - judge determines hides count
      let hidesText: string | undefined;
      let distractionsText: string | undefined;

      const isMasterLevel = classData.level?.toLowerCase().includes('master');
      if (!isMasterLevel && orgData.organization && classData.element && classData.level) {
        try {
          const { data: requirements } = await supabase
            .from('class_requirements')
            .select('hides, distractions')
            .eq('organization', orgData.organization)
            .eq('element', classData.element)
            .eq('level', classData.level)
            .single();

          if (requirements) {
            hidesText = requirements.hides;
            distractionsText = requirements.distractions;
          }
        } catch (reqError) {
          // Requirements fetch failed - continue with empty values (judge fills in)
          logger.warn('Could not fetch class requirements:', reqError);
        }
      }

      // Build scoresheet class info (extends ReportClassInfo with time limits)
      const scoresheetClassInfo: ScoresheetClassInfo = {
        className: classData.class_name || '',
        element: classData.element || '',
        level: classData.level || '',
        section: classData.section || '',
        trialDate: trialInfo?.trial_date || '',
        trialNumber: trialInfo?.trial_number?.toString() || '',
        judgeName: classData.judge_name || 'TBD',
        organization: orgData.organization,
        activityType: orgData.activity_type,
        // Include time limit data from class
        timeLimitSeconds: classData.time_limit_seconds,
        timeLimitArea2Seconds: classData.time_limit_area2_seconds,
        timeLimitArea3Seconds: classData.time_limit_area3_seconds,
        areaCount: classData.area_count,
        // Include class requirements (only for non-Master levels)
        hidesText,
        distractionsText
      };

      // Generate scoresheet
      generateScoresheetReport(scoresheetClassInfo, entries);

      // Call completion callback (e.g., close popup)
      onComplete?.();

      return { success: true };
    } catch (error) {
      logger.error('Error generating scoresheet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate scoresheet'
      };
    }
  }, []);

  return {
    handleGenerateCheckIn,
    handleGenerateResults,
    handleGenerateScoresheet,
  };
}
