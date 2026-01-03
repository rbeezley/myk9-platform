/**
 * Security Provider for myK9Show
 * Provides security context and utilities throughout the application
 * 
 * Security Features:
 * - XSS Protection with DOMPurify
 * - CSRF Token Management
 * - Rate Limiting
 * - Session Management
 * - Input Sanitization
 * - Security Event Logging
 */

import React, { useEffect, useState, ReactNode, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { logger } from '../../services/LoggingService';
import { monitoring } from '../../services/MonitoringService';
import { SecurityContext, type SecurityContextType } from '@/contexts/SecurityContext';
import { securityConfig, generateCSPPolicy, CSRFTokenManager } from '../../config/security';

// Re-export types for backward compatibility
export type { SecurityContextType } from '@/contexts/SecurityContext';

interface SecurityConfig {
  enableCSP: boolean;
  enableXSSProtection: boolean;
  enableContentTypeSniffing: boolean;
  enableReferrerPolicy: boolean;
  sessionTimeout: number;
  maxFailedAttempts: number;
  rateLimitWindow: number;
  rateLimitMaxRequests: number;
  environment: 'development' | 'production' | 'test';
}

interface SecurityState {
  isSecure: boolean;
  failedAttempts: number;
  lastActivity: number;
  sessionExpiry: number;
  rateLimitRemaining: number;
  rateLimitReset: number;
}

// Use the secure configuration from security.ts

export const SecurityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config] = useState<SecurityConfig>(securityConfig);
  const [state, setState] = useState<SecurityState>({
    isSecure: true,
    failedAttempts: 0,
    lastActivity: Date.now(),
    sessionExpiry: Date.now() + config.sessionTimeout,
    rateLimitRemaining: config.rateLimitMaxRequests,
    rateLimitReset: Date.now() + config.rateLimitWindow,
  });

  // Rate limiting storage
  const [rateLimitMap] = useState(new Map<string, { count: number; resetTime: number }>());

  const getCSPPolicy = useCallback((): string => {
    return generateCSPPolicy(config.environment);
  }, [config.environment]);

  const setupSecurityHeaders = useCallback(() => {
    // Content Security Policy
    if (config.enableCSP) {
      const cspMeta = document.createElement('meta');
      cspMeta.httpEquiv = 'Content-Security-Policy';
      cspMeta.content = getCSPPolicy();
      document.head.appendChild(cspMeta);
    }

    // X-Content-Type-Options
    if (!config.enableContentTypeSniffing) {
      const noSniffMeta = document.createElement('meta');
      noSniffMeta.httpEquiv = 'X-Content-Type-Options';
      noSniffMeta.content = 'nosniff';
      document.head.appendChild(noSniffMeta);
    }

    // Referrer Policy
    if (config.enableReferrerPolicy) {
      const referrerMeta = document.createElement('meta');
      referrerMeta.name = 'referrer';
      referrerMeta.content = 'strict-origin-when-cross-origin';
      document.head.appendChild(referrerMeta);
    }
  }, [config, getCSPPolicy]);

  const validateCSRFToken = (token: string): boolean => {
    const csrfManager = CSRFTokenManager.getInstance();
    const isValid = csrfManager.validateToken(token);
    
    if (!isValid) {
      recordSecurityEvent('csrf_token_invalid', 'high', { 
        hasToken: !!token,
        tokenLength: token?.length || 0
      });
    }

    return isValid;
  };

  const sanitizeInput = (input: string, type: 'text' | 'html' = 'text'): string => {
    if (type === 'html') {
      // Use DOMPurify for comprehensive HTML sanitization
      return DOMPurify.sanitize(input, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input', 'textarea'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
      });
    } else {
      // For plain text, use basic HTML encoding
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
  };

  const validateInput = (input: string, type: 'email' | 'phone' | 'text' | 'html'): boolean => {
    // Check for common XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    ];

    // Check for XSS patterns
    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        recordSecurityEvent('xss_attempt', 'critical', { 
          input: input.substring(0, 100),
          pattern: pattern.toString(),
          type 
        });
        return false;
      }
    }

    // Type-specific validation
    switch (type) {
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) && input.length <= 254;
      }
      
      case 'phone': {
        const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(input.replace(/[\s\-()]/g, ''));
      }
      
      case 'text':
        return input.length <= 1000 && !/[<>]/.test(input);
      
      case 'html':
        // More lenient for rich text, but still check for dangerous patterns
        return input.length <= 10000;
      
      default:
        return true;
    }
  };

  const recordSecurityEvent = useCallback((event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata?: Record<string, unknown>) => {
    logger.logSecurityEvent(event, severity, {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      ...metadata,
    });

    monitoring.trackUserEvent('security_event', {
      event,
      severity,
      ...metadata,
    });

    // Update failed attempts for certain events
    if (['login_failed', 'csrf_token_mismatch', 'xss_attempt'].includes(event)) {
      setState(prev => ({
        ...prev,
        failedAttempts: prev.failedAttempts + 1,
      }));
    }
  }, []);

  const checkRateLimit = (identifier: string): boolean => {
    const now = Date.now();
    const entry = rateLimitMap.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      rateLimitMap.set(identifier, {
        count: 1,
        resetTime: now + config.rateLimitWindow,
      });
      return true;
    }

    if (entry.count >= config.rateLimitMaxRequests) {
      recordSecurityEvent('rate_limit_exceeded', 'medium', { 
        identifier: identifier.substring(0, 20),
        count: entry.count,
        window: config.rateLimitWindow 
      });
      return false;
    }

    entry.count++;
    return true;
  };

  const resetRateLimits = useCallback(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }

    setState(prev => ({
      ...prev,
      rateLimitRemaining: config.rateLimitMaxRequests,
      rateLimitReset: now + config.rateLimitWindow,
    }));
  }, [config, rateLimitMap]);

  const updateActivity = useCallback(() => {
    const now = Date.now();
    setState(prev => ({
      ...prev,
      lastActivity: now,
      sessionExpiry: now + config.sessionTimeout,
    }));
  }, [config]);

  const isSessionValid = useCallback((): boolean => {
    const now = Date.now();
    const isValid = now < state.sessionExpiry && state.failedAttempts < config.maxFailedAttempts;
    
    if (!isValid) {
      recordSecurityEvent('session_expired', 'low', {
        lastActivity: state.lastActivity,
        failedAttempts: state.failedAttempts,
      });
    }

    return isValid;
  }, [state.sessionExpiry, state.failedAttempts, state.lastActivity, config.maxFailedAttempts, recordSecurityEvent]);

  const checkSessionExpiry = useCallback(() => {
    if (!isSessionValid()) {
      setState(prev => ({
        ...prev,
        isSecure: false,
      }));
      
      // Redirect to login or show session expired message
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
  }, [isSessionValid]);

  // Setup effect - moved after all function definitions
  useEffect(() => {
    // Setup security headers and policies
    setupSecurityHeaders();
    
    // Setup session monitoring
    const sessionInterval = setInterval(() => {
      checkSessionExpiry();
    }, 60000); // Check every minute

    // Setup rate limit reset
    const rateLimitInterval = setInterval(() => {
      resetRateLimits();
    }, config.rateLimitWindow);

    // Setup activity tracking
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => updateActivity();
    
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearInterval(sessionInterval);
      clearInterval(rateLimitInterval);
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [config, checkSessionExpiry, resetRateLimits, setupSecurityHeaders, updateActivity]);

  const contextValue: SecurityContextType = {
    config,
    state,
    validateCSRFToken,
    sanitizeInput,
    validateInput,
    recordSecurityEvent,
    checkRateLimit,
    updateActivity,
    isSessionValid,
  };

  return (
    <SecurityContext.Provider value={contextValue}>
      {children}
    </SecurityContext.Provider>
  );
};