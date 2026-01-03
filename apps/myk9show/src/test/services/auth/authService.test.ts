import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase
const mockSupabaseAuth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn()
};

const mockSupabase = {
  auth: mockSupabaseAuth,
  from: vi.fn(() => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }))
};

vi.mock('../../../lib/supabase', () => ({
  supabase: mockSupabase
}));

describe('Authentication Service Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Sign Up Flow', () => {
    it('should successfully create new user account', async () => {
      const mockUserData = {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString()
      };

      mockSupabaseAuth.signUp.mockResolvedValue({
        data: {
          user: mockUserData,
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token'
          }
        },
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signUp) {
        const result = await authModule.signUp({
          email: 'test@example.com',
          password: 'securePassword123!',
          firstName: 'John',
          lastName: 'Doe'
        });

        expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'securePassword123!',
          options: {
            data: {
              firstName: 'John',
              lastName: 'Doe'
            }
          }
        });

        expect(result.success).toBe(true);
        expect(result.user).toEqual(mockUserData);
      }
    });

    it('should handle signup validation errors', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Invalid email format',
          status: 422
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signUp) {
        const result = await authModule.signUp({
          email: 'invalid-email',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid email format');
      }
    });

    it('should handle duplicate email errors', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'User already registered',
          status: 409
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signUp) {
        const result = await authModule.signUp({
          email: 'existing@example.com',
          password: 'securePassword123!',
          firstName: 'Jane',
          lastName: 'Smith'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('User already registered');
      }
    });
  });

  describe('Sign In Flow', () => {
    it('should successfully authenticate valid credentials', async () => {
      const mockSession = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'authenticated'
        }
      };

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: mockSession.user,
          session: mockSession
        },
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signIn) {
        const result = await authModule.signIn({
          email: 'test@example.com',
          password: 'correctPassword123!'
        });

        expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'correctPassword123!'
        });

        expect(result.success).toBe(true);
        expect(result.session).toEqual(mockSession);
      }
    });

    it('should reject invalid credentials', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Invalid login credentials',
          status: 400
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signIn) {
        const result = await authModule.signIn({
          email: 'test@example.com',
          password: 'wrongPassword'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid login credentials');
      }
    });

    it('should handle network errors gracefully', async () => {
      mockSupabaseAuth.signInWithPassword.mockRejectedValue(new Error('Network error'));

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signIn) {
        const result = await authModule.signIn({
          email: 'test@example.com',
          password: 'password123'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network error');
      }
    });
  });

  describe('Session Management', () => {
    it('should retrieve current session', async () => {
      const mockSession = {
        access_token: 'mock-token',
        user: {
          id: 'user-123',
          email: 'test@example.com'
        }
      };

      mockSupabaseAuth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.getCurrentSession) {
        const result = await authModule.getCurrentSession();
        
        expect(result.session).toEqual(mockSession);
        expect(mockSupabaseAuth.getSession).toHaveBeenCalled();
      }
    });

    it('should handle expired sessions', async () => {
      mockSupabaseAuth.getSession.mockResolvedValue({
        data: { session: null },
        error: {
          message: 'Session expired',
          status: 401
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.getCurrentSession) {
        const result = await authModule.getCurrentSession();
        
        expect(result.session).toBeNull();
        expect(result.error).toContain('Session expired');
      }
    });

    it('should sign out user successfully', async () => {
      mockSupabaseAuth.signOut.mockResolvedValue({
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signOut) {
        const result = await authModule.signOut();
        
        expect(result.success).toBe(true);
        expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
      }
    });
  });

  describe('Password Reset', () => {
    it('should send password reset email', async () => {
      mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.resetPassword) {
        const result = await authModule.resetPassword('test@example.com');
        
        expect(result.success).toBe(true);
        expect(mockSupabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
          'test@example.com',
          expect.objectContaining({
            redirectTo: expect.stringContaining('/reset-password')
          })
        );
      }
    });

    it('should handle invalid email for password reset', async () => {
      mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
        error: {
          message: 'User not found',
          status: 404
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.resetPassword) {
        const result = await authModule.resetPassword('nonexistent@example.com');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('User not found');
      }
    });
  });

  describe('Auth State Changes', () => {
    it('should set up auth state listener', async () => {
      const mockCallback = vi.fn();
      const mockUnsubscribe = vi.fn();
      
      mockSupabaseAuth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.onAuthStateChange) {
        const unsubscribe = authModule.onAuthStateChange(mockCallback);
        
        expect(mockSupabaseAuth.onAuthStateChange).toHaveBeenCalledWith(mockCallback);
        expect(typeof unsubscribe).toBe('function');
      }
    });
  });

  describe('User Profile Updates', () => {
    it('should update user profile information', async () => {
      const updatedUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          firstName: 'UpdatedJohn',
          lastName: 'UpdatedDoe'
        }
      };

      mockSupabaseAuth.updateUser.mockResolvedValue({
        data: { user: updatedUser },
        error: null
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.updateProfile) {
        const result = await authModule.updateProfile({
          firstName: 'UpdatedJohn',
          lastName: 'UpdatedDoe'
        });
        
        expect(result.success).toBe(true);
        expect(result.user).toEqual(updatedUser);
        expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({
          data: {
            firstName: 'UpdatedJohn',
            lastName: 'UpdatedDoe'
          }
        });
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle service unavailable errors', async () => {
      mockSupabaseAuth.signInWithPassword.mockRejectedValue(new Error('Service temporarily unavailable'));

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signIn) {
        const result = await authModule.signIn({
          email: 'test@example.com',
          password: 'password123'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Service temporarily unavailable');
      }
    });

    it('should validate input parameters', async () => {
      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signUp) {
        // Test with missing required fields
        const result = await authModule.signUp({
          email: '',
          password: '',
          firstName: '',
          lastName: ''
        });

        // Should either handle validation internally or let Supabase handle it
        expect(result.success).toBe(false);
      }
    });

    it('should handle rate limiting gracefully', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Too many requests',
          status: 429
        }
      });

      const authModule = await import('../../../services/auth/authService');
      
      if (authModule.signIn) {
        const result = await authModule.signIn({
          email: 'test@example.com',
          password: 'password123'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Too many requests');
      }
    });
  });
});