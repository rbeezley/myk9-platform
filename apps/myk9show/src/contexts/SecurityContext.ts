/**
 * Security Context for myK9Show
 * Provides security context types and React context
 */

import { createContext } from 'react';

interface SecurityConfig {
  enableCSP: boolean;
  enableXSSProtection: boolean;
  enableContentTypeSniffing: boolean;
  enableReferrerPolicy: boolean;
  sessionTimeout: number;
  maxFailedAttempts: number;
  rateLimitWindow: number;
  rateLimitMaxRequests: number;
}

interface SecurityState {
  isSecure: boolean;
  failedAttempts: number;
  lastActivity: number;
  sessionExpiry: number;
  rateLimitRemaining: number;
  rateLimitReset: number;
}

export interface SecurityContextType {
  config: SecurityConfig;
  state: SecurityState;
  validateCSRFToken: (token: string) => boolean;
  sanitizeInput: (input: string) => string;
  validateInput: (input: string, type: 'email' | 'phone' | 'text' | 'html') => boolean;
  recordSecurityEvent: (event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: Record<string, unknown>) => void;
  checkRateLimit: (identifier: string) => boolean;
  updateActivity: () => void;
  isSessionValid: () => boolean;
}

export const SecurityContext = createContext<SecurityContextType | undefined>(undefined);