/* eslint-disable react-refresh/only-export-components */
/**
 * HTML Sanitization Utility
 * Provides secure HTML sanitization to prevent XSS attacks
 */

import DOMPurify from 'dompurify';
import React from 'react';

/**
 * Configuration for different content types
 */
export const SANITIZE_CONFIGS = {
  // Basic text with minimal formatting
  basic: {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u'] as string[],
    ALLOWED_ATTR: [] as string[],
    ALLOW_DATA_ATTR: false,
  },
  
  // Rich text content like training journal entries
  richText: {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code'
    ] as string[],
    ALLOWED_ATTR: ['class'] as string[],
    ALLOW_DATA_ATTR: false,
  },
  
  // Very restrictive for user names, titles, etc.
  textOnly: {
    ALLOWED_TAGS: [] as string[],
    ALLOWED_ATTR: [] as string[],
    ALLOW_DATA_ATTR: false,
  }
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export function sanitizeHTML(
  html: string, 
  config: keyof typeof SANITIZE_CONFIGS = 'basic'
): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const sanitizeConfig = SANITIZE_CONFIGS[config];
  
  return DOMPurify.sanitize(html, {
    ...sanitizeConfig,
    // Additional security settings
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Component wrapper for safe HTML rendering
 */
export interface SafeHTMLProps {
  html: string;
  config?: keyof typeof SANITIZE_CONFIGS;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Safe HTML component that automatically sanitizes content
 */
export function SafeHTML({ html, config = 'basic', className, fallback }: SafeHTMLProps) {
  const sanitized = sanitizeHTML(html, config);
  
  if (!sanitized && fallback) {
    return <>{fallback}</>;
  }
  
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

/**
 * Validates that content is safe for rendering
 */
export function isContentSafe(html: string): boolean {
  if (!html || typeof html !== 'string') {
    return true;
  }
  
  const sanitized = sanitizeHTML(html, 'richText');
  return sanitized === html;
}

/**
 * Strips all HTML tags and returns plain text
 */
export function stripHTML(html: string): string {
  return sanitizeHTML(html, 'textOnly');
}