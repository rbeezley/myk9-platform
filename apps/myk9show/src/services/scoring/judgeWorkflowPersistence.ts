/**
 * Judge Workflow Persistence
 *
 * Serialization/deserialization utilities for judge workflow data.
 * Handles conversion between Date objects and ISO strings for storage.
 */

import type {
  JudgeSession,
  JudgeCredentials,
  EntryAssignment,
  WorkflowTemplate,
  JudgePerformanceMetrics,
  WorkflowAction
} from './judge-workflow-types';
import type { StateStorage } from 'zustand/middleware';
import { logger } from '@/services/LoggingService';

// Storage keys
const STORAGE_KEYS = {
  SESSIONS: 'judge_sessions',
  CREDENTIALS: 'judge_credentials',
  ASSIGNMENTS: 'entry_assignments',
  TEMPLATES: 'workflow_templates',
  PERFORMANCE: 'judge_performance'
} as const;

// ============================================================================
// Session Serialization
// ============================================================================

/**
 * Serialize session for storage (converts Dates to ISO strings)
 */
export function serializeSession(session: JudgeSession): Record<string, unknown> {
  return {
    ...session,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString(),
    lastActivity: session.lastActivity.toISOString(),
    pendingActions: session.pendingActions.map(action => ({
      ...action,
      timestamp: action.timestamp.toISOString()
    }))
  };
}

/**
 * Deserialize session from storage (converts ISO strings to Dates)
 */
export function deserializeSession(data: unknown): JudgeSession {
  const sessionData = data as Record<string, unknown>;
  return {
    ...sessionData,
    startTime: new Date(sessionData.startTime as string),
    endTime: sessionData.endTime ? new Date(sessionData.endTime as string) : undefined,
    lastActivity: new Date(sessionData.lastActivity as string),
    pendingActions: ((sessionData.pendingActions || []) as WorkflowAction[]).map((action) => ({
      ...action,
      timestamp: new Date(action.timestamp as string | Date)
    })) as WorkflowAction[]
  } as JudgeSession;
}

// ============================================================================
// Metrics Serialization
// ============================================================================

/**
 * Serialize metrics for storage
 */
export function serializeMetrics(metrics: JudgePerformanceMetrics): Record<string, unknown> {
  return {
    ...metrics,
    periodStart: metrics.periodStart.toISOString(),
    periodEnd: metrics.periodEnd.toISOString()
  };
}

/**
 * Deserialize metrics from storage
 */
export function deserializeMetrics(data: unknown): JudgePerformanceMetrics {
  const metricsData = data as JudgePerformanceMetrics;
  return {
    ...metricsData,
    periodStart: new Date(metricsData.periodStart),
    periodEnd: new Date(metricsData.periodEnd)
  };
}

// ============================================================================
// Load Functions
// ============================================================================

export interface LoadedWorkflowData {
  sessions: Map<string, JudgeSession>;
  credentials: Map<string, JudgeCredentials>;
  assignments: Map<string, EntryAssignment[]>;
  templates: Map<string, WorkflowTemplate>;
  metrics: Map<string, JudgePerformanceMetrics>;
}

/**
 * Load all persisted workflow data from storage
 */
export async function loadPersistedData(storage: StateStorage): Promise<LoadedWorkflowData> {
  const result: LoadedWorkflowData = {
    sessions: new Map(),
    credentials: new Map(),
    assignments: new Map(),
    templates: new Map(),
    metrics: new Map()
  };

  try {
    // Load active sessions
    const sessions = await storage.getItem(STORAGE_KEYS.SESSIONS) || '{}';
    const sessionData = JSON.parse(sessions);
    Object.entries(sessionData).forEach(([id, data]: [string, unknown]) => {
      result.sessions.set(id, deserializeSession(data));
    });

    // Load judge credentials
    const credentials = await storage.getItem(STORAGE_KEYS.CREDENTIALS) || '{}';
    const credData = JSON.parse(credentials);
    Object.entries(credData).forEach(([id, cred]: [string, unknown]) => {
      result.credentials.set(id, cred as JudgeCredentials);
    });

    // Load entry assignments
    const assignments = await storage.getItem(STORAGE_KEYS.ASSIGNMENTS) || '{}';
    const assignData = JSON.parse(assignments);
    Object.entries(assignData).forEach(([classId, assigns]: [string, unknown]) => {
      result.assignments.set(classId, assigns as EntryAssignment[]);
    });

    // Load workflow templates
    const templates = await storage.getItem(STORAGE_KEYS.TEMPLATES) || '{}';
    const templateData = JSON.parse(templates);
    Object.entries(templateData).forEach(([id, template]: [string, unknown]) => {
      result.templates.set(id, template as WorkflowTemplate);
    });

    // Load performance metrics
    const metrics = await storage.getItem(STORAGE_KEYS.PERFORMANCE) || '{}';
    const metricsData = JSON.parse(metrics);
    Object.entries(metricsData).forEach(([judgeId, metric]: [string, unknown]) => {
      result.metrics.set(judgeId, deserializeMetrics(metric));
    });

  } catch (error) {
    logger.error('Failed to load persisted workflow data:', 'scoring', {}, error as Error);
  }

  return result;
}

// ============================================================================
// Persist Functions
// ============================================================================

/**
 * Persist sessions to storage
 */
export async function persistSessions(
  storage: StateStorage,
  sessions: Map<string, JudgeSession>
): Promise<void> {
  const data = Object.fromEntries(
    Array.from(sessions.entries()).map(([id, session]) => [
      id,
      serializeSession(session)
    ])
  );
  await storage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(data));
}

/**
 * Persist credentials to storage
 */
export async function persistCredentials(
  storage: StateStorage,
  credentials: Map<string, JudgeCredentials>
): Promise<void> {
  const data = Object.fromEntries(credentials);
  await storage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(data));
}

/**
 * Persist assignments to storage
 */
export async function persistAssignments(
  storage: StateStorage,
  assignments: Map<string, EntryAssignment[]>
): Promise<void> {
  const data = Object.fromEntries(assignments);
  await storage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(data));
}

/**
 * Persist metrics to storage
 */
export async function persistMetrics(
  storage: StateStorage,
  metrics: Map<string, JudgePerformanceMetrics>
): Promise<void> {
  const data = Object.fromEntries(
    Array.from(metrics.entries()).map(([judgeId, metric]) => [
      judgeId,
      serializeMetrics(metric)
    ])
  );
  await storage.setItem(STORAGE_KEYS.PERFORMANCE, JSON.stringify(data));
}
