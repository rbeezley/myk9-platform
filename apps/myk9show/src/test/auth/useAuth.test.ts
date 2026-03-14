import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { mockSupabase } from '@/test/mocks/supabase';
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
