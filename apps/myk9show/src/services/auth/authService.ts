/**
 * Authentication service for myK9Show application
 * Handles user authentication, session management, and user profile operations
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import type { User, Session } from '@supabase/supabase-js';

// Authentication result types
export interface AuthResult {
  success: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
}

export interface SignUpData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  metadata?: Record<string, unknown>;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface PasswordResetData {
  email: string;
  redirectTo?: string;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(data: SignUpData): Promise<AuthResult> {
  try {
    const { email, password, firstName, lastName, metadata = {} } = data;
    
    // Add name information to user metadata  
    const userMetadata = {
      ...metadata,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
    };

    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userMetadata,
      },
    });

    if (result.error) {
      return {
        success: false,
        user: null,
        session: null,
        error: result.error.message,
      };
    }

    return {
      success: true,
      user: result.data.user,
      session: result.data.session,
      error: null,
    };
  } catch (error) {
    logger.error('Sign up error', 'auth', {}, error as Error);
    return {
      success: false,
      user: null,
      session: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Sign in an existing user with email and password
 */
export async function signIn(data: SignInData): Promise<AuthResult> {
  try {
    const { email, password } = data;

    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (result.error) {
      return {
        success: false,
        user: null,
        session: null,
        error: result.error.message,
      };
    }

    return {
      success: true,
      user: result.data.user,
      session: result.data.session,
      error: null,
    };
  } catch (error) {
    logger.error('Sign in error', 'auth', {}, error as Error);
    return {
      success: false,
      user: null,
      session: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await supabase.auth.signOut();
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    
    return { success: true, error: null };
  } catch (error) {
    logger.error('Sign out error', 'auth', {}, error as Error);
    return {
      success: false,
      error: (error as Error).message || 'Unknown error occurred'
    };
  }
}

/**
 * Get the current session
 */
export async function getCurrentSession(): Promise<{ session: Session | null; error: string | null }> {
  try {
    const result = await supabase.auth.getSession();
    return {
      session: result.data.session,
      error: result.error ? result.error.message : null,
    };
  } catch (error) {
    logger.error('Get session error', 'auth', {}, error as Error);
    return {
      session: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Get the current session (alias for backward compatibility)
 */
export const getSession = getCurrentSession;

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<{ user: User | null; error: string | null }> {
  try {
    const result = await supabase.auth.getUser();
    return {
      user: result.data.user,
      error: result.error ? result.error.message : null,
    };
  } catch (error) {
    logger.error('Get user error', 'auth', {}, error as Error);
    return {
      user: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    
    return { success: true, error: null };
  } catch (error) {
    logger.error('Password reset error', 'auth', {}, error as Error);
    return {
      success: false,
      error: (error as Error).message || 'Unknown error occurred'
    };
  }
}

/**
 * Update user password
 */
export async function updatePassword(newPassword: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    
    return { success: true, error: null };
  } catch (error) {
    logger.error('Update password error', 'auth', {}, error as Error);
    return {
      success: false,
      error: (error as Error).message || 'Unknown error occurred'
    };
  }
}

/**
 * Update user profile information
 */
export async function updateProfile(data: UpdateProfileData): Promise<AuthResult> {
  try {
    const { firstName, lastName, email, metadata = {} } = data;
    
    // Prepare update data
    const updateData: { email?: string; data?: Record<string, unknown> } = {};
    
    if (email) {
      updateData.email = email;
    }
    
    // Update metadata
    const userMetadata = {
      ...metadata,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
    };
    
    if (Object.keys(userMetadata).length > 0) {
      updateData.data = userMetadata;
    }

    const result = await supabase.auth.updateUser(updateData);

    if (result.error) {
      return {
        success: false,
        user: null,
        session: null,
        error: result.error.message,
      };
    }

    return {
      success: true,
      user: result.data.user,
      session: null, // updateUser doesn't return session
      error: null,
    };
  } catch (error) {
    logger.error('Update profile error', 'auth', {}, error as Error);
    return {
      success: false,
      user: null,
      session: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Refresh the current session
 */
export async function refreshSession(): Promise<AuthResult> {
  try {
    const result = await supabase.auth.refreshSession();
    
    if (result.error) {
      return {
        success: false,
        user: null,
        session: null,
        error: result.error.message,
      };
    }

    return {
      success: true,
      user: result.data.user,
      session: result.data.session,
      error: null,
    };
  } catch (error) {
    logger.error('Refresh session error', 'auth', {}, error as Error);
    return {
      success: false,
      user: null,
      session: null,
      error: (error as Error).message || 'Unknown error occurred',
    };
  }
}

/**
 * Listen to authentication state changes
 */
export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

/**
 * Check if user email is verified
 */
export function isEmailVerified(user: User | null): boolean {
  return user?.email_confirmed_at != null;
}

/**
 * Check if current session is valid
 */
export function isSessionValid(session: Session | null): boolean {
  if (!session) return false;
  
  const now = Date.now() / 1000;
  return session.expires_at ? session.expires_at > now : false;
}

/**
 * Get user display name from user metadata
 */
export function getUserDisplayName(user: User | null): string {
  if (!user) return 'Anonymous';
  
  const metadata = user.user_metadata || {};
  const firstName = metadata.firstName || '';
  const lastName = metadata.lastName || '';
  
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (lastName) {
    return lastName;
  } else {
    // Fallback to email prefix
    return user.email?.split('@')[0] || 'User';
  }
}

/**
 * Get user initials for avatar display
 */
export function getUserInitials(user: User | null): string {
  const displayName = getUserDisplayName(user);
  
  if (displayName === 'Anonymous' || displayName === 'User') {
    return '?';
  }
  
  const parts = displayName.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  } else if (parts[0]) {
    return parts[0][0].toUpperCase();
  }
  
  return '?';
}

/**
 * Sign in an existing user with email and password (alias)
 */
export const signInWithPassword = signIn;

// Export default service object for convenience
export const authService = {
  signUp,
  signIn,
  signInWithPassword,
  signOut,
  getSession,
  getCurrentSession,
  getCurrentUser,
  resetPassword,
  updatePassword,
  updateProfile,
  refreshSession,
  onAuthStateChange,
  isEmailVerified,
  isSessionValid,
  getUserDisplayName,
  getUserInitials,
};

export default authService;