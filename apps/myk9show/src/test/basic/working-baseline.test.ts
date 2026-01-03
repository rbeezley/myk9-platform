import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ 
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    }
  }
}));

describe('Baseline Smoke Tests - Working', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle basic JavaScript functionality', () => {
    expect(1 + 1).toBe(2);
    expect(typeof window).toBe('object');
    expect(typeof localStorage).toBe('object');
  });

  it('should work with localStorage', () => {
    const testData = { name: 'Test Dog', id: 'test-1' };
    localStorage.setItem('test', JSON.stringify(testData));
    
    const retrieved = JSON.parse(localStorage.getItem('test') || '{}');
    expect(retrieved.name).toBe('Test Dog');
    expect(retrieved.id).toBe('test-1');
  });

  it('should handle async operations', async () => {
    const asyncFunction = () => Promise.resolve('success');
    const result = await asyncFunction();
    expect(result).toBe('success');
  });

  it('should import existing stores successfully', async () => {
    const { useDogStore } = await import('../../store/dogStore');
    const { useShowStore } = await import('../../store/showStore');
    
    expect(useDogStore).toBeDefined();
    expect(useShowStore).toBeDefined();
    expect(typeof useDogStore).toBe('function');
    expect(typeof useShowStore).toBe('function');
  });

  it('should handle store initialization', async () => {
    const { useDogStore } = await import('../../store/dogStore');
    const { useShowStore } = await import('../../store/showStore');
    
    // Test that stores can be called and return state
    const dogState = useDogStore.getState();
    const showState = useShowStore.getState();
    
    expect(dogState).toBeDefined();
    expect(showState).toBeDefined();
    expect(typeof dogState).toBe('object');
    expect(typeof showState).toBe('object');
  });

  it('should handle basic utility operations', () => {
    const currentDate = new Date();
    expect(currentDate).toBeInstanceOf(Date);
    
    const formattedString = currentDate.toISOString();
    expect(typeof formattedString).toBe('string');
    expect(formattedString.length).toBeGreaterThan(0);
  });

  it('should test Promise rejection handling', async () => {
    const rejectingPromise = () => Promise.reject(new Error('Test error'));
    
    try {
      await rejectingPromise();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Test error');
    }
  });
});