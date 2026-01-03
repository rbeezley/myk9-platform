/**
 * CreateAnnouncementModal Helper Functions
 *
 * Extracted from CreateAnnouncementModal.tsx to reduce complexity.
 * Contains validation logic and form data preparation.
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface AnnouncementFormData {
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  authorName: string;
  expiresAt: string;
}

export interface PreparedAnnouncementData {
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  author_role: 'admin' | 'judge' | 'steward';
  author_name?: string;
  expires_at?: string;
  license_key: string;
  is_active: boolean;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate announcement form data
 */
export function validateAnnouncementForm(data: AnnouncementFormData): ValidationResult {
  if (!data.title.trim()) {
    return { isValid: false, error: 'Title is required' };
  }

  if (!data.content.trim()) {
    return { isValid: false, error: 'Content is required' };
  }

  if (data.title.length > 200) {
    return { isValid: false, error: 'Title must be 200 characters or less' };
  }

  if (data.content.length > 2000) {
    return { isValid: false, error: 'Content must be 2000 characters or less' };
  }

  return { isValid: true };
}

/**
 * Check if user is online
 */
export function validateOnlineStatus(): ValidationResult {
  if (!navigator.onLine) {
    return {
      isValid: false,
      error: 'You must be online to create or update announcements. Please check your internet connection and try again.'
    };
  }
  return { isValid: true };
}

// ============================================================================
// Data Preparation
// ============================================================================

/**
 * Prepare announcement data for API submission
 */
export function prepareAnnouncementData(
  formData: AnnouncementFormData,
  userRole: 'admin' | 'judge' | 'steward',
  licenseKey: string
): PreparedAnnouncementData {
  return {
    title: formData.title.trim(),
    content: formData.content.trim(),
    priority: formData.priority,
    author_role: userRole,
    author_name: formData.authorName.trim() || undefined,
    expires_at: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
    license_key: licenseKey,
    is_active: true
  };
}

// ============================================================================
// Priority Options
// ============================================================================

export const PRIORITY_OPTIONS = [
  { value: 'normal' as const, label: 'Normal', icon: '📢', description: 'Standard announcement' },
  { value: 'high' as const, label: 'High Priority', icon: '⚠️', description: 'Important information' },
  { value: 'urgent' as const, label: 'Urgent', icon: '🚨', description: 'Critical updates only' }
];

/**
 * Get priority option by value
 */
export function getPriorityOption(value: string) {
  return PRIORITY_OPTIONS.find(p => p.value === value);
}
