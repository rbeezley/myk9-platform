import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import type { User } from '@supabase/supabase-js';

describe('useAuth', () => {
  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default successful mock responses
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: { user: mockUser } },
      error: null,
    });

    mockSupabase.auth.signOut.mockResolvedValue({
      error: null,
    });

    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: null,
    });

    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: '', provider: '' },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with loading state and no user', async () => {
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });

    it('should provide auth methods', () => {
      const { result } = renderHook(() => useAuth());

      expect(typeof result.current.signIn).toBe('function');
      expect(typeof result.current.signUp).toBe('function');
      expect(typeof result.current.signOut).toBe('function');
      expect(typeof result.current.resetPassword).toBe('function');
      expect(typeof result.current.updatePassword).toBe('function');
      expect(typeof result.current.updateProfile).toBe('function');
    });
  });

  describe('signUp', () => {
    it('should call Supabase signUp with correct parameters', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp('test@example.com', 'password123');
      });

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          password: 'password123',
        })
      );
    });

    it('should handle signUp errors', async () => {
      const mockError = new Error('Registration failed');
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.signUp('test@example.com', 'weak');
        });
      }).rejects.toThrow('Registration failed');
    });

    it('should handle network errors during signUp', async () => {
      mockSupabase.auth.signUp.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.signUp('test@example.com', 'password123');
        });
      }).rejects.toThrow('Network error');
    });
  });

  describe('signIn', () => {
    it('should call signInWithPassword', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
    });

    it('should handle signIn errors', async () => {
      const mockError = new Error('Invalid credentials');
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.signIn('test@example.com', 'wrongpassword');
        });
      }).rejects.toThrow('Invalid credentials');
    });

    it('should handle loading state during signIn', async () => {
      const { result } = renderHook(() => useAuth());

      const signInPromise = act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      await signInPromise;

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('signOut', () => {
    it('should call Supabase signOut', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('should handle signOut errors', async () => {
      const mockError = new Error('Sign out failed');
      mockSupabase.auth.signOut.mockResolvedValue({
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.signOut();
        });
      }).rejects.toThrow('Sign out failed');
    });
  });

  describe('resetPassword', () => {
    it('should call Supabase resetPasswordForEmail', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.resetPassword('test@example.com');
      });

      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
    });

    it('should handle resetPassword errors', async () => {
      const mockError = new Error('Reset failed');
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.resetPassword('test@example.com');
        });
      }).rejects.toThrow('Reset failed');
    });
  });

  describe('updatePassword', () => {
    it('should call Supabase updateUser for password', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.updatePassword('newpassword123');
      });

      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newpassword123',
      });
    });

    it('should handle updatePassword errors', async () => {
      const mockError = new Error('Update failed');
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.updatePassword('newpassword123');
        });
      }).rejects.toThrow('Update failed');
    });
  });

  describe('updateProfile', () => {
    it('should call Supabase updateUser with profile updates', async () => {
      const { result } = renderHook(() => useAuth());

      const updates = {
        email: 'newemail@example.com',
        data: { firstName: 'John', lastName: 'Doe' },
      };

      await act(async () => {
        await result.current.updateProfile(updates);
      });

      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith(updates);
    });

    it('should handle updateProfile errors', async () => {
      const mockError = new Error('Profile update failed');
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: null },
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.updateProfile({
            email: 'newemail@example.com',
          });
        });
      }).rejects.toThrow('Profile update failed');
    });
  });

  describe('signInWithGoogle', () => {
    it('should call signInWithOAuth with google provider', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    });

    it('should throw on OAuth error', async () => {
      const mockError = new Error('OAuth failed');
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: null, provider: '' },
        error: mockError,
      });

      const { result } = renderHook(() => useAuth());

      await expect(async () => {
        await act(async () => {
          await result.current.signInWithGoogle();
        });
      }).rejects.toThrow('OAuth failed');
    });
  });

  describe('OAuth people record creation', () => {
    it('should create people record for first-time OAuth user', async () => {
      const oauthUser: User = {
        ...mockUser,
        app_metadata: { provider: 'google' },
        user_metadata: { given_name: 'Jane', family_name: 'Doe' },
      };

      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertChain = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'new-person-id' }, error: null }),
          }),
        }),
      };
      // exhibitor_profiles insert chain
      const profileInsertChain = {
        insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
      };

      let authChangeCallback: (event: string, session: { user: User } | null) => void;
      mockSupabase.auth.onAuthStateChange.mockImplementation(
        (cb: (event: string, session: { user: User } | null) => void) => {
          authChangeCallback = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );

      let fromCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'people') {
          fromCallCount++;
          if (fromCallCount === 1) return selectChain;
          if (fromCallCount === 2) return insertChain;
        }
        if (table === 'exhibitor_profiles') return profileInsertChain;
        return createChainableQuery();
      });

      renderHook(() => useAuth());

      await act(async () => {
        authChangeCallback!('SIGNED_IN', { user: oauthUser });
      });

      expect(selectChain.eq).toHaveBeenCalledWith('auth_user_id', 'test-user-id');
      expect(insertChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'test@example.com',
          auth_user_id: 'test-user-id',
        }),
      ]);
      expect(profileInsertChain.insert).toHaveBeenCalledWith({
        person_id: 'new-person-id',
        auth_user_id: 'test-user-id',
      });
    });

    it('should not create people record if one already exists', async () => {
      const oauthUser: User = {
        ...mockUser,
        app_metadata: { provider: 'google' },
        user_metadata: { given_name: 'Jane', family_name: 'Doe' },
      };

      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-id' }, error: null }),
      };

      let authChangeCallback: (event: string, session: { user: User } | null) => void;
      mockSupabase.auth.onAuthStateChange.mockImplementation(
        (cb: (event: string, session: { user: User } | null) => void) => {
          authChangeCallback = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'people') return selectChain;
        return createChainableQuery();
      });

      renderHook(() => useAuth());

      await act(async () => {
        authChangeCallback!('SIGNED_IN', { user: oauthUser });
      });

      expect(selectChain.eq).toHaveBeenCalledWith('auth_user_id', 'test-user-id');
      expect(mockSupabase.from).toHaveBeenCalledWith('people');
    });

    it('should not create people record for email provider', async () => {
      const emailUser: User = {
        ...mockUser,
        app_metadata: { provider: 'email' },
      };

      let authChangeCallback: (event: string, session: { user: User } | null) => void;
      mockSupabase.auth.onAuthStateChange.mockImplementation(
        (cb: (event: string, session: { user: User } | null) => void) => {
          authChangeCallback = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );

      renderHook(() => useAuth());

      await act(async () => {
        authChangeCallback!('SIGNED_IN', { user: emailUser });
      });

      expect(mockSupabase.from).not.toHaveBeenCalledWith('people');
    });

    it('should log error but not throw when people record insert fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const oauthUser: User = {
        ...mockUser,
        app_metadata: { provider: 'google' },
        user_metadata: { given_name: 'Jane', family_name: 'Doe' },
      };

      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertChain = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS blocked' } }),
          }),
        }),
      };

      let authChangeCallback: (event: string, session: { user: User } | null) => void;
      mockSupabase.auth.onAuthStateChange.mockImplementation(
        (cb: (event: string, session: { user: User } | null) => void) => {
          authChangeCallback = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );

      let fromCallCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'people') {
          fromCallCount++;
          if (fromCallCount === 1) return selectChain;
          if (fromCallCount === 2) return insertChain;
        }
        return createChainableQuery();
      });

      renderHook(() => useAuth());

      await act(async () => {
        authChangeCallback!('SIGNED_IN', { user: oauthUser });
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to create people record for OAuth user:',
        expect.objectContaining({ message: 'RLS blocked' })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Auth State', () => {
    it('should update user when auth state changes', async () => {
      mockSupabase.auth.onAuthStateChange.mockImplementation(
        (callback: (event: string, session: { user: User } | null) => void) => {
          callback('SIGNED_IN', { user: mockUser });
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }
      );

      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it('should not call Supabase methods with invalid state', async () => {
      const { result } = renderHook(() => useAuth());

      // Should not crash
      expect(result.current.user).toBeDefined();
      expect(typeof result.current.signUp).toBe('function');
    });
  });
});
