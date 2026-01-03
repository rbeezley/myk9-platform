import { supabase, ShowQueue, TrialQueue, ClassQueue } from '../lib/supabase';
import { validatePasscodeAgainstLicenseKey, UserRole } from '../utils/auth';
import { logger } from '../utils/logger';

export interface ShowData {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string; // Organization type from view_unique_mobile_app_lic_key
  competition_type: string; // Competition type from view_unique_mobile_app_lic_key
  trials: TrialQueue[];
  classes: ClassQueue[];
}

// Edge Function URL for server-side validation with rate limiting
const VALIDATE_PASSCODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-passcode`;

/**
 * Server-side passcode validation result
 */
interface ServerValidationResult {
  success: boolean;
  role?: UserRole;
  showData?: {
    showId: string;
    showName: string;
    clubName: string;
    showDate: string;
    licenseKey: string;
    org: string;
    competition_type: string;
  };
  error?: 'rate_limited' | 'invalid_passcode' | 'server_error';
  message?: string;
  remaining_attempts?: number;
  blocked_until?: string;
}

/**
 * Authenticates via server-side Edge Function with rate limiting
 * Falls back to client-side validation if Edge Function unavailable
 */
async function authenticateViaEdgeFunction(passcode: string): Promise<ServerValidationResult> {
  try {
    const response = await fetch(VALIDATE_PASSCODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ passcode }),
    });

    const data = await response.json();

    if (response.status === 429) {
      // Rate limited
      return {
        success: false,
        error: 'rate_limited',
        message: data.message || 'Too many failed attempts. Please try again later.',
        remaining_attempts: 0,
        blocked_until: data.blocked_until,
      };
    }

    if (response.status === 401) {
      // Check if this is from our Edge Function (has 'error' field) vs Supabase gateway
      // Gateway returns: { code: 401, message: "Missing authorization header" }
      // Our function returns: { error: 'invalid_passcode', message: '...', remaining_attempts: N }
      if (data.error === 'invalid_passcode') {
        // Genuine invalid passcode from our Edge Function
        return {
          success: false,
          error: 'invalid_passcode',
          message: data.message || 'Invalid passcode.',
          remaining_attempts: data.remaining_attempts,
        };
      }
      // Unexpected 401 (gateway issue, auth misconfiguration, etc.) - fall back to client-side
      logger.warn('[Auth] Unexpected 401 from Edge Function, falling back:', data);
      throw new Error('Unexpected 401 - gateway or auth issue');
    }

    if (!response.ok) {
      // Server error
      throw new Error(data.error || 'Server validation failed');
    }

    // Success
    return {
      success: true,
      role: data.role,
      showData: data.showData,
    };
  } catch (error) {
    logger.warn('[Auth] Edge Function unavailable, falling back to client-side:', error);
    return {
      success: false,
      error: 'server_error',
      message: 'Server validation unavailable',
    };
  }
}

/**
 * Authentication result with additional rate limit info
 */
export interface AuthResult {
  showData: ShowData | null;
  error?: 'rate_limited' | 'invalid_passcode' | 'server_error';
  message?: string;
  remaining_attempts?: number;
  blocked_until?: string;
  role?: UserRole;
}

/**
 * Authenticates a passcode by finding the corresponding show data
 * Uses server-side Edge Function for rate limiting protection
 * Falls back to client-side validation if Edge Function unavailable
 *
 * @param passcode - 5 character passcode (e.g., "j9f3b")
 * @returns AuthResult with showData if valid, error info if invalid/rate-limited
 */
export async function authenticatePasscode(passcode: string): Promise<ShowData | null>;
export async function authenticatePasscode(passcode: string, options: { returnFullResult: true }): Promise<AuthResult>;
export async function authenticatePasscode(
  passcode: string,
  options?: { returnFullResult?: boolean }
): Promise<ShowData | null | AuthResult> {
  const returnFullResult = options?.returnFullResult ?? false;

  try {
    // Step 1: Try server-side validation with rate limiting
    const serverResult = await authenticateViaEdgeFunction(passcode);

    // Handle rate limiting
    if (serverResult.error === 'rate_limited') {
      logger.warn('[Auth] Rate limited by server');
      if (returnFullResult) {
        return {
          showData: null,
          error: 'rate_limited',
          message: serverResult.message,
          remaining_attempts: 0,
          blocked_until: serverResult.blocked_until,
        };
      }
      return null;
    }

    // Handle invalid passcode from server
    if (serverResult.error === 'invalid_passcode') {
      if (returnFullResult) {
        return {
          showData: null,
          error: 'invalid_passcode',
          message: serverResult.message,
          remaining_attempts: serverResult.remaining_attempts,
        };
      }
      return null;
    }

    // Handle server success - get trials and classes
    if (serverResult.success && serverResult.showData) {
      const showData = await enrichShowData(serverResult.showData);
      if (returnFullResult) {
        return {
          showData,
          role: serverResult.role,
        };
      }
      return showData;
    }

    // Step 2: Fall back to client-side validation (Edge Function unavailable)
    logger.log('[Auth] Using client-side validation fallback');
    return await authenticatePasscodeClientSide(passcode, returnFullResult);

  } catch (error) {
    logger.error('Authentication error:', error);
    if (returnFullResult) {
      return {
        showData: null,
        error: 'server_error',
        message: 'Authentication failed',
      };
    }
    return null;
  }
}

/**
 * Enriches show data with trials and classes
 */
async function enrichShowData(baseShowData: {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string;
  competition_type: string;
}): Promise<ShowData> {
  // Get trials for this show
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('*')
    .eq('show_id', parseInt(baseShowData.showId))
    .order('trial_date', { ascending: true });

  if (trialsError) {
    logger.error('Error fetching trials:', trialsError);
  }

  // Get classes for all trials
  const trialIds = trials?.map(trial => trial.id) || [];
  let classes = null;

  if (trialIds.length > 0) {
    const { data: classesData, error: classesError } = await supabase
      .from('classes')
      .select('*')
      .in('trial_id', trialIds)
      .order('class_order', { ascending: true });

    if (classesError) {
      logger.error('Error fetching classes:', classesError);
    }
    classes = classesData;
  }

  return {
    ...baseShowData,
    trials: trials || [],
    classes: classes || [],
  };
}

/**
 * Client-side passcode validation (fallback when Edge Function unavailable)
 * WARNING: This does not have rate limiting protection
 */
async function authenticatePasscodeClientSide(
  passcode: string,
  returnFullResult: boolean
): Promise<ShowData | null | AuthResult> {
  // Get all shows to check passcode against each mobile_app_lic_key
  const { data: shows, error: showError } = await supabase
    .from('shows')
    .select('*')
    .order('created_at', { ascending: false });

  if (showError) {
    logger.error('Error fetching shows:', showError);
    if (returnFullResult) {
      return { showData: null, error: 'server_error', message: 'Database error' };
    }
    return null;
  }

  if (!shows || shows.length === 0) {
    if (returnFullResult) {
      return { showData: null, error: 'invalid_passcode', message: 'No shows found' };
    }
    return null;
  }

  // Check passcode against each show's license key
  let matchedShow: ShowQueue | null = null;

  for (const show of shows) {
    const validationResult = validatePasscodeAgainstLicenseKey(
      passcode,
      show.license_key
    );

    if (validationResult) {
      matchedShow = show;
      break;
    }
  }

  if (!matchedShow) {
    if (returnFullResult) {
      return { showData: null, error: 'invalid_passcode', message: 'Invalid passcode' };
    }
    return null;
  }

  // Get trials for this show
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('*')
    .eq('show_id', matchedShow.id)
    .order('trial_date', { ascending: true });

  if (trialsError) {
    logger.error('Error fetching trials:', trialsError);
  }

  // Get classes for this show
  const trialIds = trials?.map(trial => trial.id) || [];
  let classes = null;

  if (trialIds.length > 0) {
    const { data: classesData, error: classesError } = await supabase
      .from('classes')
      .select('*')
      .in('trial_id', trialIds)
      .order('class_order', { ascending: true });

    if (classesError) {
      logger.error('Error fetching classes:', classesError);
    }
    classes = classesData;
  }

  // Get org and competition_type
  const { data: licenseData, error: licenseError } = await supabase
    .from('shows')
    .select('organization, show_type')
    .eq('license_key', matchedShow.license_key)
    .single();

  if (licenseError) {
    logger.error('Error fetching license data:', licenseError);
  }

  const showData: ShowData = {
    showId: matchedShow.id.toString(),
    showName: matchedShow.show_name,
    clubName: matchedShow.club_name,
    showDate: matchedShow.start_date,
    licenseKey: matchedShow.license_key,
    org: matchedShow.organization || licenseData?.organization || '',
    competition_type: matchedShow.show_type || licenseData?.show_type || 'Regular',
    trials: trials || [],
    classes: classes || [],
  };

  if (returnFullResult) {
    return { showData };
  }
  return showData;
}

/**
 * Gets show data by license key (for already authenticated users)
 * @param licenseKey - The mobile_app_lic_key
 * @returns ShowData if found, null if not found
 */
export async function getShowByLicenseKey(licenseKey: string): Promise<ShowData | null> {
  try {
    const { data: show, error: showError } = await supabase
      .from('shows')
      .select('*')
      .eq('license_key', licenseKey)
      .single();

    if (showError || !show) {
      logger.error('Error fetching show:', showError);
      return null;
    }

    // Get trials for this show
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('*')
      .eq('show_id', show.id)
      .order('trial_date', { ascending: true });

    if (trialsError) {
      logger.error('Error fetching trials:', trialsError);
    }

    // Get classes for all trials in this show
    let classes = null;
    let classesError = null;

    if (trials && trials.length > 0) {
      const trialIds = trials.map(trial => trial.id);
      const classesResult = await supabase
        .from('classes')
        .select('*')
        .in('trial_id', trialIds)
        .order('class_order', { ascending: true });

      classes = classesResult.data;
      classesError = classesResult.error;

      if (classesError) {
        logger.error('Error fetching classes:', classesError);
      }
    }

    // Get org and competition_type from shows table
    const { data: licenseData, error: licenseError } = await supabase
      .from('shows')
      .select('organization, show_type')
      .eq('license_key', licenseKey)
      .single();

    if (licenseError) {
      logger.error('Error fetching license data:', licenseError);
    }

    return {
      showId: show.id.toString(),
      showName: show.show_name,
      clubName: show.club_name,
      showDate: show.start_date,
      licenseKey: show.license_key,
      org: show.organization || licenseData?.organization || '', // Try show table first, then fallback
      competition_type: show.show_type || licenseData?.show_type || 'Regular',
      trials: trials || [],
      classes: classes || []
    };

  } catch (error) {
    logger.error('Error getting show by license key:', error);
    return null;
  }
}

/**
 * Test database connection
 * @returns boolean indicating if connection is successful
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const { data: _data, error } = await supabase
      .from('shows')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Database connection error:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}