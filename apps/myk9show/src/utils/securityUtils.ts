/**
 * Security utility functions and types
 */

import { useContext } from 'react';
import { SecurityContext, type SecurityContextType } from '@/contexts/SecurityContext';

// Hook for accessing security context
export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

// Security utility functions
export const SecurityUtils = {
  generateCSRFToken: (): string => {
    const token = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(token, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  generateNonce: (): string => {
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...nonce));
  },

  hashPassword: async (password: string, salt: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  },

  validatePasswordStrength: (password: string): { 
    isValid: boolean; 
    score: number; 
    feedback: string[] 
  } => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else {
      score += 1;
    }

    if (!/[a-z]/.test(password)) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      feedback.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    if (password.length >= 12) {
      score += 1;
    }

    return {
      isValid: score >= 4,
      score,
      feedback,
    };
  },

  isSecureContext: (): boolean => {
    return window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  },

  detectBot: (): boolean => {
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /crawling/i,
      /headless/i,
    ];

    const userAgent = navigator.userAgent;
    return botPatterns.some(pattern => pattern.test(userAgent));
  },

  validateOrigin: (allowedOrigins: string[]): boolean => {
    const origin = window.location.origin;
    return allowedOrigins.includes(origin);
  },
};