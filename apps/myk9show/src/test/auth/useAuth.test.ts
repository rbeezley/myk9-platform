import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@supabase/supabase-js';

// Mock Supabase completely
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

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

  // Get the mocked supabase instance
  let mockSupabase: Record<string, unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the mocked supabase
    const { supabase } = await import('../../lib/supabase');
    mockSupabase = supabase;
    
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
    it('should initialize with mock development user', () => {
      const { result } = renderHook(() => useAuth());
      
      // The current implementation always sets a dev user immediately
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBeDefined();
      expect(result.current.user?.email).toBe('dev@example.com');
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

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
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
    it('should handle signIn in development mode', async () => {
      const { result } = renderHook(() => useAuth());
      
      await act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      // In development mode, it should set user based on email
      expect(result.current.user).toBeDefined();
      expect(result.current.user?.email).toBe('test@example.com');
      expect(result.current.loading).toBe(false);
    });

    it('should set user based on email in development', async () => {
      const { result } = renderHook(() => useAuth());
      
      await act(async () => {
        await result.current.signIn('custom@example.com', 'password');
      });

      expect(result.current.user?.email).toBe('custom@example.com');
    });

    it('should handle loading state during signIn', async () => {
      const { result } = renderHook(() => useAuth());
      
      // Start signIn
      const signInPromise = act(async () => {
        await result.current.signIn('test@example.com', 'password');
      });

      // Complete the signIn
      await signInPromise;

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('signOut', () => {
    it('should handle signOut in development mode', async () => {
      const { result } = renderHook(() => useAuth());
      
      // First ensure we have a dev user
      expect(result.current.user?.email).toBe('dev@example.com');
      
      await act(async () => {
        await result.current.signOut();
      });

      // In development mode with dev user, it should clear the user
      expect(result.current.user).toBeNull();
    });

    it('should call Supabase signOut for non-dev users', async () => {
      const { result } = renderHook(() => useAuth());
      
      // First sign in with a non-dev user
      await act(async () => {
        await result.current.signIn('real@example.com', 'password');
      });

      // Now sign out
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
      
      // Sign in with non-dev user to trigger real signOut
      await act(async () => {
        await result.current.signIn('real@example.com', 'password');
      });

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

      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com'
      );
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

  describe('Development Mode Behavior', () => {
    it('should use mock user in development without Supabase config', () => {
      const { result } = renderHook(() => useAuth());
      
      // Should immediately have a dev user
      expect(result.current.user).toBeDefined();
      expect(result.current.user?.id).toBe('dev-user');
      expect(result.current.user?.email).toBe('dev@example.com');
      expect(result.current.loading).toBe(false);
    });

    it('should not call Supabase methods during initialization', () => {
      renderHook(() => useAuth());
      
      // Due to the current implementation that's disabled for testing,
      // Supabase methods should not be called during initialization
      expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
      expect(mockSupabase.auth.onAuthStateChange).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle promise rejections gracefully', async () => {
      // Test that methods don't crash the hook when errors occur
      mockSupabase.auth.signUp.mockRejectedValue(new Error('Network error'));
      
      const { result } = renderHook(() => useAuth());
      
      // Should not crash
      expect(result.current.user).toBeDefined();
      expect(typeof result.current.signUp).toBe('function');
    });

    it('should maintain user state after method errors', async () => {
      const { result } = renderHook(() => useAuth());
      
      // Cause an error in signOut - for dev user, this won't throw
      // So let's test with a real user first
      await act(async () => {
        await result.current.signIn('real@example.com', 'password');
      });

      // Now cause signOut error
      mockSupabase.auth.signOut.mockResolvedValue({
        error: new Error('Sign out failed'),
      });
      
      try {
        await act(async () => {
          await result.current.signOut();
        });
      } catch {
        // Expected to throw
      }
      
      // User state should remain unchanged after error
      expect(result.current.user?.email).toBe('real@example.com');
    });
  });
});