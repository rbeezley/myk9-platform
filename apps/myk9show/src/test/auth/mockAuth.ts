import { vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

// Create a simple mock auth that doesn't rely on Supabase
export const createMockAuth = () => {
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

  return {
    user: mockUser,
    loading: false,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  };
};

// Mock implementations for different scenarios
export const createLoadingMockAuth = () => ({
  ...createMockAuth(),
  loading: true,
});

export const createUnauthenticatedMockAuth = () => ({
  ...createMockAuth(),
  user: null,
});

export const createCustomUserMockAuth = (email: string) => ({
  ...createMockAuth(),
  user: {
    ...createMockAuth().user,
    email,
  },
});