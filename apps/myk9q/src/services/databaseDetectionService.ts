/**
 * Database Detection Service
 *
 * This service implements dual-database auto-detection during the migration period.
 * It checks if a license key exists in the legacy database and redirects to Flutter app if found,
 * otherwise continues with V3 React app.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import { supabase as supabaseV3 } from '@/lib/supabase'; // Reuse main client

// Legacy Database Configuration
const LEGACY_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL_LEGACY;
const LEGACY_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY_LEGACY;

// Flutter App URL
const FLUTTER_APP_URL = import.meta.env.VITE_LEGACY_APP_URL || 'https://myk9q208.flutterflow.app';

// Create legacy client only if needed (singleton pattern)
let supabaseLegacy: ReturnType<typeof createClient> | null = null;
if (LEGACY_SUPABASE_URL && LEGACY_SUPABASE_ANON_KEY) {
  supabaseLegacy = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_ANON_KEY);
}

/** V3 show data structure returned by detectDatabaseWithValidation */
export interface V3ShowData {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string;
  competition_type: string;
  show_type: string;
}

export interface DetectionResult {
  database: 'v3' | 'legacy';
  redirectUrl?: string;
  /** V3 returns V3ShowData, legacy returns raw DB record */
  showData?: V3ShowData | Record<string, unknown>;
  message?: string;
}

/**
 * Note: These functions are currently unused but kept for potential future database migration features
 * They can be removed if database detection is no longer needed
 */

/*
async function checkLegacyDatabase(licenseKey: string): Promise<boolean> {
  if (!supabaseLegacy) {
return false;
  }

  try {
    const { data, error } = await supabaseLegacy
      .from('tbl_show_queue')
      .select('id, mobile_app_lic_key')
      .eq('mobile_app_lic_key', licenseKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      logger.error('Legacy database check error:', error);
      return false;
    }

    return data !== null;
  } catch (error) {
    logger.error('Legacy database connection error:', error);
    return false;
  }
}

async function checkV3Database(licenseKey: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseV3
      .from('shows')
      .select('id, license_key')
      .eq('license_key', licenseKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      logger.error('V3 database check error:', error);
      return false;
    }

    return data !== null;
  } catch (error) {
    logger.error('V3 database connection error:', error);
    return false;
  }
}

function extractPotentialLicenseKeys(passcode: string): string[] {
  if (!passcode || passcode.length !== 5) {
    return [];
  }

  const segment = passcode.substring(1);
  const potentialKeys: string[] = [];

  // We'll need to fetch all shows and check against each license key
  // This is handled by the actual authentication service
  // For detection, we return a marker to indicate we need to check all shows
  return ['CHECK_ALL_SHOWS'];
}
*/

/**
 * Detect which database contains the show for a given passcode
 * @param passcode The user's passcode
 * @returns Detection result with database type and optional redirect URL
 */
export async function detectDatabase(_passcode: string): Promise<DetectionResult> {
// During migration, we need to check both databases
  // Since we can't directly map passcode to license key without checking all shows,
  // we'll need to try authentication against both databases

  try {
    // First, try to find the show in V3 database
    // This requires checking all shows since passcode is derived from license key
    const { data: v3Shows, error: v3Error } = await supabaseV3
      .from('shows')
      .select('license_key')
      .order('created_at', { ascending: false });

    if (!v3Error && v3Shows && v3Shows.length > 0) {
      // Check if passcode matches any V3 show
      // The actual validation is done in authService
      // For now, we'll attempt V3 first
return {
        database: 'v3',
        message: 'Attempting V3 authentication'
      };
    }

    // If no shows in V3 or error, check legacy database
    if (supabaseLegacy) {
      const { data: legacyShows, error: legacyError } = await supabaseLegacy
        .from('tbl_show_queue')
        .select('mobile_app_lic_key')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!legacyError && legacyShows && legacyShows.length > 0) {
return {
          database: 'legacy',
          redirectUrl: FLUTTER_APP_URL,
          message: 'Redirecting to legacy app'
        };
      }
    }

    // Default to V3 if no clear determination
    return {
      database: 'v3',
      message: 'No shows found, defaulting to V3'
    };

  } catch (error) {
    logger.error('Database detection error:', error);
    // Default to V3 on error
    return {
      database: 'v3',
      message: 'Detection error, defaulting to V3'
    };
  }
}

/** Legacy show record type */
type LegacyShowRecord = { mobile_app_lic_key?: string; [key: string]: unknown };

/**
 * Find a matching show in legacy database by passcode
 * Extracted to reduce nesting depth (DEBT-009)
 */
function findLegacyShowMatch(
  legacyShows: unknown[],
  passcode: string,
  validatePasscodeAgainstLicenseKey: (passcode: string, licenseKey: string) => unknown
): DetectionResult | null {
  for (const show of legacyShows) {
    // Legacy database uses mobile_app_lic_key field
    const legacyShow = show as LegacyShowRecord;
    if (!legacyShow.mobile_app_lic_key) continue;
    if (!validatePasscodeAgainstLicenseKey(passcode, legacyShow.mobile_app_lic_key)) continue;

    // Pass passcode to Flutter app for auto-login (backwards compatible)
    const flutterUrl = new URL(FLUTTER_APP_URL);
    flutterUrl.searchParams.set('passcode', passcode);

    return {
      database: 'legacy',
      redirectUrl: flutterUrl.toString(),
      showData: legacyShow as Record<string, unknown>,
      message: 'Show found in legacy database - redirecting to Flutter app (auto-login if supported)'
    };
  }

  return null;
}

/**
 * Enhanced detection that actually validates the passcode
 * This is the recommended approach during migration
 */
export async function detectDatabaseWithValidation(passcode: string): Promise<DetectionResult> {
// Import auth validation function
  const { validatePasscodeAgainstLicenseKey } = await import('../utils/auth');

  try {
    // Check V3 database first
    const { data: v3Shows, error: v3Error } = await supabaseV3
      .from('shows')
      .select('*')
      .order('created_at', { ascending: false });

    if (!v3Error && v3Shows) {
      for (const show of v3Shows) {
        if (validatePasscodeAgainstLicenseKey(passcode, show.license_key)) {
          // Map V3 database fields to showContext format
          const showData: V3ShowData = {
            showId: String(show.id),
            showName: show.show_name,
            clubName: show.club_name,
            showDate: show.start_date,
            licenseKey: show.license_key,
            org: show.org || show.organization || '',
            competition_type: show.competition_type || 'Regular',
            show_type: show.show_type || show.competition_type || 'Regular'
          };

return {
            database: 'v3',
            showData,
            message: 'Show found in V3 database'
          };
        }
      }
    }

    // Check legacy database if configured
    if (supabaseLegacy) {
      const { data: legacyShows, error: legacyError } = await supabaseLegacy
        .from('tbl_show_queue')
        .select('*')
        .order('created_at', { ascending: false });

      if (!legacyError && legacyShows) {
        const legacyMatch = findLegacyShowMatch(legacyShows, passcode, validatePasscodeAgainstLicenseKey);
        if (legacyMatch) return legacyMatch;
      }
    }

    // No match found in either database
    return {
      database: 'v3',
      message: 'Invalid passcode - no matching show found'
    };

  } catch (error) {
    logger.error('Database validation error:', error);
    return {
      database: 'v3',
      message: 'Validation error - please try again'
    };
  }
}

/**
 * Check if migration mode is enabled
 * @returns true if both databases are configured
 */
export function isMigrationModeEnabled(): boolean {
  return !!(LEGACY_SUPABASE_URL && LEGACY_SUPABASE_ANON_KEY);
}

/**
 * Get migration status for display to users
 */
export function getMigrationStatus(): {
  enabled: boolean;
  v3Configured: boolean;
  legacyConfigured: boolean;
  flutterUrl: string;
} {
  return {
    enabled: isMigrationModeEnabled(),
    v3Configured: !!supabaseV3, // V3 client is always configured via main import
    legacyConfigured: !!(LEGACY_SUPABASE_URL && LEGACY_SUPABASE_ANON_KEY),
    flutterUrl: FLUTTER_APP_URL
  };
}