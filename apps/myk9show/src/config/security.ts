import { logger } from '@/services/LoggingService';

/**
 * Security Configuration for MyK9Show
 * 
 * Centralizes security settings and environment validation
 * Prevents exposure of sensitive configuration to client-side
 */

export interface SecurityConfig {
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

/**
 * Validates environment variables and provides secure defaults
 */
function validateEnvironment(): SecurityConfig {
  const env = import.meta.env.MODE || 'development';
  
  // Only allow specific environment variables to be exposed client-side
  const config: SecurityConfig = {
    enableCSP: env === 'production',
    enableXSSProtection: true,
    enableContentTypeSniffing: false,
    enableReferrerPolicy: true,
    sessionTimeout: parseInt(import.meta.env.VITE_SESSION_TIMEOUT || '3600000', 10), // 1 hour default
    maxFailedAttempts: parseInt(import.meta.env.VITE_MAX_FAILED_ATTEMPTS || '5', 10),
    rateLimitWindow: 60000, // 1 minute
    rateLimitMaxRequests: 100,
    environment: env as 'development' | 'production' | 'test'
  };

  // Validate configuration values
  if (config.sessionTimeout < 300000) { // Minimum 5 minutes
    logger.warn('Session timeout too short, setting to minimum 5 minutes', 'app', {});
    config.sessionTimeout = 300000;
  }

  if (config.maxFailedAttempts < 3 || config.maxFailedAttempts > 10) {
    logger.warn('Max failed attempts out of range, setting to 5', 'app', {});
    config.maxFailedAttempts = 5;
  }

  return config;
}

/**
 * Content Security Policy configuration
 */
export function generateCSPPolicy(environment: string): string {
  const baseDirectives = [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "child-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "manifest-src 'self'",
  ];

  if (environment === 'development') {
    baseDirectives.push(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' ws://localhost:* https://*.supabase.co wss://*.supabase.co"
    );
  } else {
    // Production - more restrictive
    baseDirectives.push(
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    );
  }

  return baseDirectives.join('; ');
}

/**
 * Security headers configuration
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

/**
 * Validate and sanitize environment variables
 */
export function getSecureEnvironmentVar(key: string, defaultValue: string = ''): string {
  const value = import.meta.env[key];
  
  if (!value) {
    if (import.meta.env.MODE === 'production' && !defaultValue) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return defaultValue;
  }

  // Basic validation for common environment variables
  if (key.includes('URL')) {
    try {
      new URL(value);
    } catch {
      throw new Error(`Invalid URL format for ${key}: ${value}`);
    }
  }

  if (key.includes('KEY') || key.includes('SECRET')) {
    if (value.length < 10) {
      throw new Error(`${key} appears to be too short for a secure key`);
    }
  }

  return value;
}

/**
 * Get the validated security configuration
 */
export const securityConfig = validateEnvironment();

/**
 * Check if we're in a secure context
 */
export function isSecureContext(): boolean {
  return window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
}

/**
 * Generate a secure random token.
 * Requires a secure context (HTTPS or localhost).
 */
export function generateSecureToken(length: number = 32): string {
  if (!isSecureContext()) {
    throw new Error(
      'generateSecureToken requires a secure context (HTTPS or localhost). ' +
      'Ensure the app is served over HTTPS in production.'
    );
  }

  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a value using Web Crypto API (SHA-256).
 * Requires a secure context (HTTPS or localhost).
 */
export async function secureHash(data: string): Promise<string> {
  if (!isSecureContext()) {
    throw new Error(
      'secureHash requires a secure context (HTTPS or localhost). ' +
      'Ensure the app is served over HTTPS in production.'
    );
  }

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * CSRF token management
 */
export class CSRFTokenManager {
  private static instance: CSRFTokenManager;
  private token: string | null = null;
  private expiry: number = 0;

  static getInstance(): CSRFTokenManager {
    if (!CSRFTokenManager.instance) {
      CSRFTokenManager.instance = new CSRFTokenManager();
    }
    return CSRFTokenManager.instance;
  }

  generateToken(): string {
    this.token = generateSecureToken(32);
    this.expiry = Date.now() + (15 * 60 * 1000); // 15 minutes
    
    // Store in sessionStorage for form validation
    sessionStorage.setItem('csrf_token', this.token);
    sessionStorage.setItem('csrf_expiry', this.expiry.toString());
    
    return this.token;
  }

  validateToken(token: string): boolean {
    const storedToken = sessionStorage.getItem('csrf_token');
    const storedExpiry = sessionStorage.getItem('csrf_expiry');
    
    if (!storedToken || !storedExpiry || !token) {
      return false;
    }

    // Check expiry
    if (Date.now() > parseInt(storedExpiry, 10)) {
      this.clearToken();
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    return this.constantTimeEqual(token, storedToken);
  }

  clearToken(): void {
    this.token = null;
    this.expiry = 0;
    sessionStorage.removeItem('csrf_token');
    sessionStorage.removeItem('csrf_expiry');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

export default securityConfig;