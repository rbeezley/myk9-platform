import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Custom authentication hook that provides user authentication state and methods
 * @returns {Object} Authentication context with user state and auth methods
 * @property {User | null} user - The currently authenticated user or null if not authenticated
 * @property {boolean} loading - Indicates if authentication state is being checked
 * @property {Function} signIn - Method to sign in a user with email and password
 * @property {Function} signUp - Method to register a new user
 * @property {Function} signOut - Method to sign out the current user
 * @property {Function} resetPassword - Method to send a password reset email
 * @property {Function} updatePassword - Method to update user's password
 * @property {Function} updateProfile - Method to update user's profile information
 */

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

      // Create people record for first-time OAuth users
      if (event === 'SIGNED_IN' && session?.user) {
        const signedInUser = session.user;
        const isOAuth = signedInUser.app_metadata?.provider !== 'email';
        if (isOAuth) {
          try {
            const { data: existing } = await supabase
              .from('people')
              .select('id')
              .eq('auth_user_id', signedInUser.id)
              .maybeSingle();

            if (!existing) {
              const firstName: string =
                signedInUser.user_metadata?.given_name ||
                signedInUser.user_metadata?.full_name?.split(' ')[0] ||
                'First';
              const lastName: string =
                signedInUser.user_metadata?.family_name ||
                signedInUser.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
                'Name';
              const { error: insertError } = await supabase.from('people').insert([
                {
                  first_name: firstName,
                  last_name: lastName,
                  email: signedInUser.email ?? null,
                  roles: ['exhibitor'],
                  auth_user_id: signedInUser.id,
                },
              ]);

              if (insertError) {
                console.error('Failed to create people record for OAuth user:', insertError);
              }
            }
          } catch (err) {
            console.error('Error checking/creating people record for OAuth user:', err);
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Registers a new user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @param {Object} metadata - Additional user metadata
   * @throws {AuthError} If registration fails
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata?: { firstName?: string; lastName?: string }
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: metadata?.firstName || 'First',
            last_name: metadata?.lastName || 'Name',
          },
        },
      });

      if (error) {
        throw error;
      }

      // If user is created successfully, create corresponding public.user record
      if (data.user) {
        try {
          const { error: insertError } = await supabase.from('people').insert([
            {
              first_name: metadata?.firstName || 'First',
              last_name: metadata?.lastName || 'Name',
              email: email,
              roles: ['exhibitor'],
              auth_user_id: data.user.id,
            },
          ]);

          if (insertError) {
            // Profile creation failed - auth user is created, profile creation can be retried
          }
        } catch {
          // Profile creation failed - auth user is created, profile creation can be retried
        }
      }
    },
    []
  );

  /**
   * Signs in a user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @throws {AuthError} If authentication fails
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  }, []);

  /**
   * Signs in a user with Google OAuth
   * @throws {AuthError} If OAuth initiation fails
   */
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  /**
   * Signs out the current user
   * @throws {AuthError} If sign out fails
   */
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    // Navigate to landing page after sign out
    window.location.href = '/';
  }, []);

  /**
   * Sends a password reset email to the specified email address
   * @param {string} email - The email address to send the reset link to
   * @throws {AuthError} If the operation fails
   */
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) {
      throw error;
    }
  }, []);

  /**
   * Updates the user's password
   * @param {string} newPassword - The new password
   * @throws {AuthError} If the operation fails
   */
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      throw error;
    }
  }, []);

  /**
   * Updates the user's profile information
   * @param {Object} updates - The profile updates to apply
   * @param {string} [updates.email] - New email address
   * @param {string} [updates.password] - New password
   * @param {Object} [updates.data] - Additional user metadata
   * @throws {AuthError} If the operation fails
   */
  const updateProfile = useCallback(
    async (updates: { email?: string; password?: string; data?: Record<string, unknown> }) => {
      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        throw error;
      }
    },
    []
  );

  return {
    user,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
  };
}
