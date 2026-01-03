/**
 * ShowDetails Utility Functions
 *
 * Pure utility functions for ShowDetails page.
 * Separated from components to allow React Fast Refresh to work properly.
 */

import type { Show } from '@/services/replication';

// ============================================================================
// Types
// ============================================================================

export interface ContactInfo {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format date range for display
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  };

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', options);
  }

  // Check if same month and year
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const startStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const endStr = `${end.toLocaleDateString('en-US', { weekday: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
    return `${startStr} - ${endStr}`;
  }

  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

/**
 * Generate Google Maps URL
 */
export function getGoogleMapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

/**
 * Get weather URL for a location (uses Google search weather widget)
 * Uses city/state/zip format which triggers the weather widget better than full address
 */
export function getWeatherUrl(show: Show): string {
  // Build a simple location for weather (city, state zip works best for Google's weather widget)
  const parts = [
    show.site_city,
    show.site_state,
    show.site_zip
  ].filter(Boolean);

  // Fallback to full address or legacy location
  const location = parts.length > 0
    ? parts.join(' ')
    : (getFullSiteAddress(show) || show.location || '');

  return `https://www.google.com/search?q=weather+${encodeURIComponent(location)}`;
}

/**
 * Build full site address from show data
 */
export function getFullSiteAddress(show: Show): string | null {
  const parts = [
    show.site_address,
    show.site_city,
    show.site_state && show.site_zip
      ? `${show.site_state} ${show.site_zip}`
      : (show.site_state || show.site_zip)
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Get secretary info with fallback to legacy fields
 */
export function getSecretaryInfo(show: Show): ContactInfo {
  return {
    name: show.secretary_name || show.show_secretary_name,
    email: show.secretary_email || show.show_secretary_email,
    phone: show.secretary_phone || show.show_secretary_phone
  };
}

/**
 * Get chairman info
 */
export function getChairmanInfo(show: Show): ContactInfo {
  return {
    name: show.chairman_name,
    email: show.chairman_email,
    phone: show.chairman_phone
  };
}

/**
 * Check if contact info has any data
 */
export function hasContactInfo(contact: ContactInfo): boolean {
  return Boolean(contact.name || contact.email || contact.phone);
}
