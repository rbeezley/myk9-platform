/**
 * ErrorClassificationService - Categorizes and routes errors for appropriate handling
 * 
 * Provides intelligent error classification, routing, and recovery suggestions
 * based on error patterns and application context
 */

import { LoggingService } from '@/services/LoggingService';
import { MonitoringService } from '@/services/MonitoringService';
import type { APIError } from './APIErrorInterceptor';
import type { ErrorDetails } from './GlobalErrorHandler';

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverable: boolean;
  userVisible: boolean;
  autoRetry: boolean;
  requiresUserAction: boolean;
  escalate: boolean;
  tags: string[];
}

export interface ErrorRecoveryAction {
  type: 'retry' | 'refresh' | 'navigate' | 'clear_cache' | 'logout' | 'contact_support';
  label: string;
  description: string;
  automated: boolean;
  priority: number;
}

export interface ClassifiedError {
  originalError: ErrorDetails | APIError;
  classification: ErrorClassification;
  recoveryActions: ErrorRecoveryAction[];
  userMessage: string;
  technicalMessage: string;
  fingerprint: string;
  timestamp: number;
}

export type ErrorCategory = 
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'network'
  | 'database'
  | 'business_logic'
  | 'system'
  | 'user_input'
  | 'external_service'
  | 'performance'
  | 'security'
  | 'ui_render'
  | 'data_integrity'
  | 'configuration';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorPattern {
  pattern: string | RegExp;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverable: boolean;
  tags: string[];
}

class ErrorClassificationService {
  private loggingService: LoggingService;
  private monitoringService: MonitoringService;
  
  // Error classification patterns
  private readonly errorPatterns: ErrorPattern[] = [
    // Authentication errors
    {
      pattern: /unauthorized|401|token.*expired|authentication.*failed/i,
      category: 'authentication',
      severity: 'high',
      recoverable: true,
      tags: ['auth', 'token', 'session']
    },
    {
      pattern: /forbidden|403|access.*denied|permission.*denied/i,
      category: 'authorization',
      severity: 'high',
      recoverable: false,
      tags: ['permission', 'rbac', 'access']
    },
    
    // Validation errors
    {
      pattern: /validation.*failed|invalid.*input|422|bad.*request|400/i,
      category: 'validation',
      severity: 'medium',
      recoverable: true,
      tags: ['validation', 'input', 'form']
    },
    
    // Network errors
    {
      pattern: /network.*error|fetch.*failed|connection.*failed|timeout|504|502|503/i,
      category: 'network',
      severity: 'high',
      recoverable: true,
      tags: ['network', 'connectivity', 'timeout']
    },
    
    // Database errors
    {
      pattern: /database.*error|sql.*error|connection.*timeout|deadlock|500/i,
      category: 'database',
      severity: 'critical',
      recoverable: true,
      tags: ['database', 'persistence', 'transaction']
    },
    
    // UI Rendering errors
    {
      pattern: /cannot.*read.*property|undefined.*property|render.*error|hydration/i,
      category: 'ui_render',
      severity: 'high',
      recoverable: true,
      tags: ['react', 'component', 'render']
    },
    
    // Code splitting / chunk errors
    {
      pattern: /chunk.*load.*error|loading.*css.*chunk.*failed|loading.*chunk.*failed/i,
      category: 'system',
      severity: 'high',
      recoverable: true,
      tags: ['chunk', 'code-splitting', 'deployment']
    },
    
    // Performance errors
    {
      pattern: /memory.*exceeded|performance|timeout.*exceeded|slow.*query/i,
      category: 'performance',
      severity: 'medium',
      recoverable: true,
      tags: ['performance', 'memory', 'optimization']
    },
    
    // Security errors
    {
      pattern: /cors.*error|csp.*violation|xss|csrf|security.*violation/i,
      category: 'security',
      severity: 'critical',
      recoverable: false,
      tags: ['security', 'cors', 'csp']
    },
    
    // Business logic errors
    {
      pattern: /entry.*limit.*exceeded|class.*full|registration.*closed|conflict.*detected/i,
      category: 'business_logic',
      severity: 'medium',
      recoverable: false,
      tags: ['business', 'rules', 'logic']
    },
    
    // External service errors
    {
      pattern: /stripe.*error|payment.*failed|email.*failed|sms.*failed/i,
      category: 'external_service',
      severity: 'high',
      recoverable: true,
      tags: ['external', 'payment', 'notification']
    },
    
    // Data integrity errors
    {
      pattern: /data.*corruption|integrity.*constraint|foreign.*key|unique.*constraint/i,
      category: 'data_integrity',
      severity: 'critical',
      recoverable: false,
      tags: ['data', 'integrity', 'constraint']
    }
  ];

  // Recovery actions by category
  private readonly recoveryActionsByCategory: Record<ErrorCategory, ErrorRecoveryAction[]> = {
    authentication: [
      {
        type: 'logout',
        label: 'Sign In Again',
        description: 'Your session has expired. Please sign in again.',
        automated: false,
        priority: 1
      },
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh the page and try again.',
        automated: false,
        priority: 2
      }
    ],
    authorization: [
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'You need additional permissions. Contact your administrator.',
        automated: false,
        priority: 1
      },
      {
        type: 'navigate',
        label: 'Go to Dashboard',
        description: 'Return to your dashboard.',
        automated: false,
        priority: 2
      }
    ],
    validation: [
      {
        type: 'retry',
        label: 'Try Again',
        description: 'Please correct the highlighted fields and try again.',
        automated: false,
        priority: 1
      }
    ],
    network: [
      {
        type: 'retry',
        label: 'Retry',
        description: 'Check your internet connection and try again.',
        automated: true,
        priority: 1
      },
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh the page to reload data.',
        automated: false,
        priority: 2
      }
    ],
    database: [
      {
        type: 'retry',
        label: 'Try Again',
        description: 'Please wait a moment and try again.',
        automated: true,
        priority: 1
      },
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'If the problem persists, contact support.',
        automated: false,
        priority: 2
      }
    ],
    business_logic: [
      {
        type: 'refresh',
        label: 'Refresh Data',
        description: 'Refresh to see current availability.',
        automated: false,
        priority: 1
      }
    ],
    system: [
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh the page to reload the application.',
        automated: false,
        priority: 1
      },
      {
        type: 'clear_cache',
        label: 'Clear Cache',
        description: 'Clear your browser cache and try again.',
        automated: false,
        priority: 2
      }
    ],
    user_input: [
      {
        type: 'retry',
        label: 'Correct Input',
        description: 'Please check your input and try again.',
        automated: false,
        priority: 1
      }
    ],
    external_service: [
      {
        type: 'retry',
        label: 'Try Again',
        description: 'The service may be temporarily unavailable.',
        automated: true,
        priority: 1
      },
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'If the problem continues, contact support.',
        automated: false,
        priority: 2
      }
    ],
    performance: [
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh to clear memory and try again.',
        automated: false,
        priority: 1
      }
    ],
    security: [
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh the page and try again.',
        automated: false,
        priority: 1
      },
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'Report this security issue to support.',
        automated: false,
        priority: 2
      }
    ],
    ui_render: [
      {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Refresh the page to reload the interface.',
        automated: false,
        priority: 1
      }
    ],
    data_integrity: [
      {
        type: 'refresh',
        label: 'Refresh Data',
        description: 'Refresh to see the current state.',
        automated: false,
        priority: 1
      },
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'Report this data issue to support.',
        automated: false,
        priority: 2
      }
    ],
    configuration: [
      {
        type: 'contact_support',
        label: 'Contact Support',
        description: 'This appears to be a configuration issue.',
        automated: false,
        priority: 1
      }
    ]
  };

  constructor() {
    this.loggingService = LoggingService.getInstance();
    this.monitoringService = MonitoringService.getInstance();
  }

  /**
   * Classify an error and provide recovery actions
   */
  classifyError(error: ErrorDetails | APIError): ClassifiedError {
    const classification = this.analyzeError(error);
    const recoveryActions = this.getRecoveryActions(classification.category);
    const userMessage = this.generateUserMessage(error, classification);
    const technicalMessage = this.generateTechnicalMessage(error);
    const fingerprint = this.generateErrorFingerprint(error);

    const classifiedError: ClassifiedError = {
      originalError: error,
      classification,
      recoveryActions,
      userMessage,
      technicalMessage,
      fingerprint,
      timestamp: Date.now()
    };

    // Log classification
    this.logErrorClassification(classifiedError);

    return classifiedError;
  }

  /**
   * Analyze error and determine classification
   */
  private analyzeError(error: ErrorDetails | APIError): ErrorClassification {
    const message = error.message.toLowerCase();
    
    // Find matching pattern
    for (const pattern of this.errorPatterns) {
      const regex = typeof pattern.pattern === 'string' ? 
        new RegExp(pattern.pattern, 'i') : 
        pattern.pattern;
      
      if (regex.test(message)) {
        return {
          category: pattern.category,
          severity: pattern.severity,
          recoverable: pattern.recoverable,
          userVisible: true,
          autoRetry: this.shouldAutoRetry(pattern.category),
          requiresUserAction: this.requiresUserAction(pattern.category),
          escalate: pattern.severity === 'critical',
          tags: pattern.tags
        };
      }
    }

    // Default classification for unmatched errors
    return {
      category: 'system',
      severity: 'medium',
      recoverable: true,
      userVisible: true,
      autoRetry: false,
      requiresUserAction: true,
      escalate: false,
      tags: ['unclassified']
    };
  }

  /**
   * Get recovery actions for error category
   */
  private getRecoveryActions(category: ErrorCategory): ErrorRecoveryAction[] {
    return this.recoveryActionsByCategory[category] || [
      {
        type: 'retry',
        label: 'Try Again',
        description: 'Please try the action again.',
        automated: false,
        priority: 1
      }
    ];
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(error: ErrorDetails | APIError, classification: ErrorClassification): string {
    // If it's an API error with a user message, use that
    if ('userMessage' in error && error.userMessage) {
      return error.userMessage;
    }

    // Generate message based on category
    const categoryMessages: Record<ErrorCategory, string> = {
      authentication: 'Your session has expired. Please sign in again.',
      authorization: 'You don\'t have permission to perform this action.',
      validation: 'Please check your input and try again.',
      network: 'Connection failed. Please check your internet and try again.',
      database: 'A temporary issue occurred. Please try again in a moment.',
      business_logic: 'This action cannot be completed at this time.',
      system: 'An unexpected error occurred. Please try refreshing the page.',
      user_input: 'Please check your input and try again.',
      external_service: 'A service is temporarily unavailable. Please try again later.',
      performance: 'The operation is taking longer than expected. Please try again.',
      security: 'A security issue was detected. Please refresh and try again.',
      ui_render: 'Display issue detected. Please refresh the page.',
      data_integrity: 'Data consistency issue detected. Please refresh and try again.',
      configuration: 'A configuration issue was detected. Please contact support.'
    };

    return categoryMessages[classification.category] || 'An error occurred. Please try again.';
  }

  /**
   * Generate technical error message for developers
   */
  private generateTechnicalMessage(error: ErrorDetails | APIError): string {
    if ('stack' in error && error.stack) {
      return `${error.message}\n\nStack trace:\n${error.stack}`;
    }
    
    return error.message;
  }

  /**
   * Generate error fingerprint for deduplication
   */
  private generateErrorFingerprint(error: ErrorDetails | APIError): string {
    const message = error.message.replace(/\d+/g, 'N').replace(/['"]/g, '');
    const source = 'stack' in error && error.stack ? 
      error.stack.split('\n')[1] : 
      'url' in error ? error.url : 'unknown';
    
    return btoa(`${message}:${source}`).substring(0, 16);
  }

  /**
   * Determine if error should auto-retry
   */
  private shouldAutoRetry(category: ErrorCategory): boolean {
    return ['network', 'database', 'external_service'].includes(category);
  }

  /**
   * Determine if error requires user action
   */
  private requiresUserAction(category: ErrorCategory): boolean {
    return ['validation', 'user_input', 'authentication', 'authorization'].includes(category);
  }

  /**
   * Log error classification for monitoring
   */
  private logErrorClassification(classifiedError: ClassifiedError): void {
    this.loggingService.info('Error classified', 'error-classification', {
      fingerprint: classifiedError.fingerprint,
      category: classifiedError.classification.category,
      severity: classifiedError.classification.severity,
      recoverable: classifiedError.classification.recoverable,
      tags: classifiedError.classification.tags
    });

    this.monitoringService.recordError(classifiedError.originalError.message, 'error-classification');
  }

  /**
   * Get error statistics by category
   */
  getErrorStatistics(): Record<ErrorCategory, number> {
    // This would typically fetch from a data store
    // For now, return empty stats
    return Object.keys(this.recoveryActionsByCategory).reduce((acc, category) => {
      acc[category as ErrorCategory] = 0;
      return acc;
    }, {} as Record<ErrorCategory, number>);
  }

  /**
   * Singleton instance
   */
  private static instance: ErrorClassificationService;
  
  static getInstance(): ErrorClassificationService {
    if (!ErrorClassificationService.instance) {
      ErrorClassificationService.instance = new ErrorClassificationService();
    }
    return ErrorClassificationService.instance;
  }
}

export { ErrorClassificationService };