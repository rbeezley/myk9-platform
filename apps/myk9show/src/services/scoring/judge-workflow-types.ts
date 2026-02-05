/**
 * Judge Workflow Types
 *
 * Type definitions for judge workflow management including
 * sessions, credentials, assignments, and performance metrics.
 */

import type { ScoringFormat } from '@/types/scoring-types';

// ============================================================================
// Core Types
// ============================================================================

export type JudgeRole = 'judge' | 'head_judge' | 'steward' | 'show_secretary';
export type WorkflowStep = 'setup' | 'entry_assignment' | 'scoring' | 'review' | 'finalization' | 'completed';
export type AssignmentStrategy = 'sequential' | 'random' | 'optimized' | 'manual';

// ============================================================================
// Judge Credentials
// ============================================================================

export interface JudgeCredentials {
  judgeId: string;
  judgeName: string;
  role: JudgeRole;
  certifications: string[];
  authorizedFormats: ScoringFormat[];
  licenseNumber?: string;
  organization?: string; // AKC, UKC, etc.
}

// ============================================================================
// Judge Session
// ============================================================================

export interface JudgeSession {
  id: string;
  judgeId: string;
  classId: string;
  format: ScoringFormat;
  role: JudgeRole;

  // Workflow state
  currentStep: WorkflowStep;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;

  // Entry management
  assignedEntries: string[];
  completedEntries: string[];
  currentEntryId?: string | undefined;
  entryAssignmentStrategy: AssignmentStrategy;

  // Session configuration
  allowRetry: boolean;
  requireConfirmation: boolean;
  enableRealTimeSync: boolean;
  autoAdvance: boolean;

  // Performance tracking
  averageTimePerEntry?: number;
  totalEntriesScored: number;
  errorCount: number;
  lastActivity: Date;

  // Offline support
  isOffline: boolean;
  pendingActions: WorkflowAction[];
  syncStatus: 'synced' | 'pending' | 'error';
}

// ============================================================================
// Workflow Action
// ============================================================================

export interface WorkflowAction {
  id: string;
  type: 'score_entry' | 'entry_assignment' | 'workflow_step' | 'conflict_resolution';
  timestamp: Date;
  data: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed';
  attempts: number;
}

// ============================================================================
// Entry Assignment
// ============================================================================

export interface EntryAssignment {
  entryId: string;
  judgeId: string;
  assignedAt: Date;
  priority: number;
  estimatedDuration?: number;
  specialRequirements?: string[];
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped' | 'reassigned';
}

// ============================================================================
// Workflow Template
// ============================================================================

export interface WorkflowTemplate {
  id: string;
  name: string;
  format: ScoringFormat;
  steps: WorkflowStepDefinition[];
  defaultSettings: Partial<JudgeSession>;
  isCustom: boolean;
}

export interface WorkflowStepDefinition {
  step: WorkflowStep;
  name: string;
  description: string;
  required: boolean;
  allowSkip: boolean;
  estimatedDuration?: number;
  prerequisites?: WorkflowStep[];
  actions: string[];
}

// ============================================================================
// Performance Metrics
// ============================================================================

export interface JudgePerformanceMetrics {
  judgeId: string;
  period: 'day' | 'week' | 'month';

  // Scoring metrics
  totalEntriesScored: number;
  averageTimePerEntry: number;
  errorRate: number;
  revisionRate: number;

  // Quality metrics
  validationSuccessRate: number;
  conflictRate: number;
  consistencyScore: number;

  // Workflow metrics
  sessionCompletionRate: number;
  averageSessionDuration: number;
  stepSkipRate: number;

  // Period comparison
  periodStart: Date;
  periodEnd: Date;
  previousPeriodComparison?: {
    entriesChange: number;
    timeChange: number;
    errorChange: number;
  };
}

// ============================================================================
// Statistics
// ============================================================================

export interface JudgeWorkflowStatistics {
  activeSessions: number;
  totalJudges: number;
  totalEntriesScored: number;
  averageSessionDuration: number;
}
