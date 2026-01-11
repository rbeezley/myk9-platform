/**
 * Data Retention Policy Manager
 * 
 * Defines and enforces data retention policies for different types
 * of data in the system, ensuring compliance and optimal performance.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-case-declarations */

import { logger } from '@/services/LoggingService';

export interface RetentionPolicy {
  /** Unique identifier for the policy */
  id: string;
  /** Name of the policy */
  name: string;
  /** Description of what this policy covers */
  description: string;
  /** Data types this policy applies to */
  dataTypes: DataType[];
  /** Retention rules */
  rules: RetentionRule[];
  /** Whether this policy is active */
  isActive: boolean;
  /** Priority (higher number = higher priority) */
  priority: number;
}

export type DataType = 
  | 'show'
  | 'entry'
  | 'dog'
  | 'person'
  | 'result'
  | 'payment'
  | 'document'
  | 'audit_log'
  | 'temp_data';

export interface RetentionRule {
  /** Condition that triggers this rule */
  condition: RetentionCondition;
  /** Action to take when condition is met */
  action: RetentionAction;
  /** Additional parameters for the action */
  actionParams?: Record<string, any>;
}

export interface RetentionCondition {
  type: 'age' | 'status' | 'custom';
  /** For age-based: number of days */
  ageDays?: number;
  /** For status-based: target status */
  status?: string;
  /** For custom: function that returns boolean */
  customCheck?: (item: any) => boolean;
}

export type RetentionAction = 
  | 'archive'
  | 'compress'
  | 'anonymize'
  | 'delete'
  | 'export'
  | 'summarize';

export interface RetentionExecutionResult {
  policyId: string;
  executedAt: Date;
  itemsProcessed: number;
  actionsPerformed: Record<RetentionAction, number>;
  errors: string[];
}

// Default retention policies
export const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    id: 'completed-shows',
    name: 'Completed Shows Archival',
    description: 'Archive completed shows after 30 days to reduce active memory usage',
    dataTypes: ['show', 'entry', 'result'],
    rules: [
      {
        condition: { type: 'status', status: 'completed' },
        action: 'archive',
        actionParams: { afterDays: 30, compress: true }
      }
    ],
    isActive: true,
    priority: 10
  },
  {
    id: 'inactive-dogs',
    name: 'Inactive Dog Profiles',
    description: 'Archive dog profiles with no activity for 1 year',
    dataTypes: ['dog'],
    rules: [
      {
        condition: { type: 'age', ageDays: 365 },
        action: 'archive',
        actionParams: { keepSummary: true }
      }
    ],
    isActive: true,
    priority: 5
  },
  {
    id: 'gdpr-compliance',
    name: 'GDPR Personal Data',
    description: 'Anonymize personal data after 2 years of inactivity',
    dataTypes: ['person'],
    rules: [
      {
        condition: { type: 'age', ageDays: 730 },
        action: 'anonymize',
        actionParams: { 
          fieldsToAnonymize: ['email', 'phone', 'address'],
          keepNonIdentifying: true 
        }
      }
    ],
    isActive: true,
    priority: 20
  },
  {
    id: 'payment-records',
    name: 'Payment Record Retention',
    description: 'Keep payment records for 7 years for tax purposes',
    dataTypes: ['payment'],
    rules: [
      {
        condition: { type: 'age', ageDays: 2555 }, // 7 years
        action: 'export',
        actionParams: { format: 'csv', includeMetadata: true }
      },
      {
        condition: { type: 'age', ageDays: 2556 },
        action: 'delete'
      }
    ],
    isActive: true,
    priority: 15
  },
  {
    id: 'temp-data-cleanup',
    name: 'Temporary Data Cleanup',
    description: 'Remove temporary data after 7 days',
    dataTypes: ['temp_data'],
    rules: [
      {
        condition: { type: 'age', ageDays: 7 },
        action: 'delete'
      }
    ],
    isActive: true,
    priority: 25
  },
  {
    id: 'audit-log-compression',
    name: 'Audit Log Compression',
    description: 'Compress audit logs older than 90 days',
    dataTypes: ['audit_log'],
    rules: [
      {
        condition: { type: 'age', ageDays: 90 },
        action: 'compress',
        actionParams: { algorithm: 'gzip', level: 9 }
      }
    ],
    isActive: true,
    priority: 8
  }
];

export class DataRetentionPolicyManager {
  private policies: Map<string, RetentionPolicy> = new Map();
  private executionHistory: RetentionExecutionResult[] = [];
  
  constructor(policies: RetentionPolicy[] = DEFAULT_POLICIES) {
    policies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });
  }

  /**
   * Add or update a retention policy
   */
  public setPolicy(policy: RetentionPolicy): void {
    this.policies.set(policy.id, policy);
    logger.info('Retention policy set', 'lifecycle', { policyName: policy.name });
  }

  /**
   * Remove a retention policy
   */
  public removePolicy(policyId: string): boolean {
    const result = this.policies.delete(policyId);
    if (result) {
      logger.info('Retention policy removed', 'lifecycle', { policyId });
    }
    return result;
  }

  /**
   * Get all active policies for a data type
   */
  public getPoliciesForDataType(dataType: DataType): RetentionPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => 
        policy.isActive && 
        policy.dataTypes.includes(dataType)
      )
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute retention policies for a specific data type
   */
  public async executePolicies(
    dataType: DataType,
    items: any[],
    actionHandlers: Record<RetentionAction, (item: any, params?: any) => Promise<void>>
  ): Promise<RetentionExecutionResult[]> {
    const policies = this.getPoliciesForDataType(dataType);
    const results: RetentionExecutionResult[] = [];
    
    for (const policy of policies) {
      const result = await this.executePolicy(policy, items, actionHandlers);
      results.push(result);
      this.executionHistory.push(result);
    }
    
    return results;
  }

  /**
   * Execute a single retention policy
   */
  private async executePolicy(
    policy: RetentionPolicy,
    items: any[],
    actionHandlers: Record<RetentionAction, (item: any, params?: any) => Promise<void>>
  ): Promise<RetentionExecutionResult> {
    logger.info('Executing retention policy', 'lifecycle', { policyName: policy.name });
    
    const result: RetentionExecutionResult = {
      policyId: policy.id,
      executedAt: new Date(),
      itemsProcessed: 0,
      actionsPerformed: {} as Record<RetentionAction, number>,
      errors: []
    };
    
    for (const rule of policy.rules) {
      const matchingItems = items.filter(item => 
        this.evaluateCondition(rule.condition, item)
      );
      
      for (const item of matchingItems) {
        try {
          const handler = actionHandlers[rule.action];
          if (!handler) {
            throw new Error(`No handler for action: ${rule.action}`);
          }
          
          await handler(item, rule.actionParams);
          
          result.itemsProcessed++;
          result.actionsPerformed[rule.action] = 
            (result.actionsPerformed[rule.action] || 0) + 1;
            
        } catch (error) {
          const errorMsg = `Failed to ${rule.action} item: ${error}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, 'lifecycle');
        }
      }
    }
    
    logger.info('Policy execution complete', 'lifecycle', { itemsProcessed: result.itemsProcessed });
    return result;
  }

  /**
   * Evaluate if an item meets a retention condition
   */
  private evaluateCondition(condition: RetentionCondition, item: any): boolean {
    switch (condition.type) {
      case 'age':
        if (!condition.ageDays || !item.createdAt) return false;
        const ageMs = Date.now() - new Date(item.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return ageDays >= condition.ageDays;
        
      case 'status':
        return item.status === condition.status;
        
      case 'custom':
        return condition.customCheck ? condition.customCheck(item) : false;
        
      default:
        return false;
    }
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(limit?: number): RetentionExecutionResult[] {
    const history = [...this.executionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Generate retention policy report
   */
  public generateReport(): {
    totalPolicies: number;
    activePolicies: number;
    executionStats: {
      totalExecutions: number;
      totalItemsProcessed: number;
      actionBreakdown: Record<RetentionAction, number>;
      errorRate: number;
    };
    policySummary: Array<{
      id: string;
      name: string;
      dataTypes: DataType[];
      lastExecuted?: Date;
      itemsProcessed?: number;
    }>;
  } {
    const activePolicies = Array.from(this.policies.values())
      .filter(p => p.isActive);
    
    // Aggregate execution stats
    let totalItemsProcessed = 0;
    const actionBreakdown: Record<RetentionAction, number> = {} as any;
    let totalErrors = 0;
    
    this.executionHistory.forEach(exec => {
      totalItemsProcessed += exec.itemsProcessed;
      totalErrors += exec.errors.length;
      
      Object.entries(exec.actionsPerformed).forEach(([action, count]) => {
        actionBreakdown[action as RetentionAction] = 
          (actionBreakdown[action as RetentionAction] || 0) + count;
      });
    });
    
    // Generate policy summary
    const policySummary = Array.from(this.policies.values()).map(policy => {
      const executions = this.executionHistory.filter(e => e.policyId === policy.id);
      const lastExecution = executions[executions.length - 1];
      
      return {
        id: policy.id,
        name: policy.name,
        dataTypes: policy.dataTypes,
        lastExecuted: lastExecution?.executedAt,
        itemsProcessed: executions.reduce((sum, e) => sum + e.itemsProcessed, 0)
      };
    });
    
    return {
      totalPolicies: this.policies.size,
      activePolicies: activePolicies.length,
      executionStats: {
        totalExecutions: this.executionHistory.length,
        totalItemsProcessed,
        actionBreakdown,
        errorRate: totalErrors / Math.max(1, this.executionHistory.length)
      },
      policySummary
    };
  }

  /**
   * Export policies for backup or sharing
   */
  public exportPolicies(): RetentionPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Import policies
   */
  public importPolicies(policies: RetentionPolicy[], replace: boolean = false): void {
    if (replace) {
      this.policies.clear();
    }
    
    policies.forEach(policy => {
      this.setPolicy(policy);
    });
    
    logger.info('Imported retention policies', 'lifecycle', { count: policies.length });
  }
}

// Singleton instance
let policyManager: DataRetentionPolicyManager | null = null;

export function getRetentionPolicyManager(): DataRetentionPolicyManager {
  if (!policyManager) {
    policyManager = new DataRetentionPolicyManager();
  }
  return policyManager;
}