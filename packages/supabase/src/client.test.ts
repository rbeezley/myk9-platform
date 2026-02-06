import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need to reset the module between tests since client.ts uses module-level singletons
// Use dynamic imports to get fresh module state
describe('Supabase client', () => {
  beforeEach(async () => {
    // Reset modules to clear singleton state
    vi.resetModules();
  });

  describe('initSupabase', () => {
    it('should create a Supabase client with valid config', async () => {
      const { initSupabase } = await import('./client');
      const client = initSupabase({
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      });
      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
    });

    it('should throw when url is missing', async () => {
      const { initSupabase } = await import('./client');
      expect(() =>
        initSupabase({ url: '', anonKey: 'test-key' })
      ).toThrow('Missing Supabase configuration');
    });

    it('should throw when anonKey is missing', async () => {
      const { initSupabase } = await import('./client');
      expect(() =>
        initSupabase({ url: 'https://test.supabase.co', anonKey: '' })
      ).toThrow('Missing Supabase configuration');
    });

    it('should return the same instance for same config', async () => {
      const { initSupabase } = await import('./client');
      const config = { url: 'https://test.supabase.co', anonKey: 'test-key' };
      const client1 = initSupabase(config);
      const client2 = initSupabase(config);
      expect(client1).toBe(client2);
    });

    it('should create a new instance for different config', async () => {
      const { initSupabase } = await import('./client');
      const client1 = initSupabase({
        url: 'https://test1.supabase.co',
        anonKey: 'key1',
      });
      const client2 = initSupabase({
        url: 'https://test2.supabase.co',
        anonKey: 'key2',
      });
      expect(client1).not.toBe(client2);
    });
  });

  describe('getSupabase', () => {
    it('should throw when not initialized', async () => {
      const { getSupabase } = await import('./client');
      expect(() => getSupabase()).toThrow(
        'Supabase client not initialized. Call initSupabase() first.'
      );
    });

    it('should return the client after initialization', async () => {
      const { initSupabase, getSupabase } = await import('./client');
      const initialized = initSupabase({
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
      });
      const retrieved = getSupabase();
      expect(retrieved).toBe(initialized);
    });
  });

  describe('isSupabaseInitialized', () => {
    it('should return false before initialization', async () => {
      const { isSupabaseInitialized } = await import('./client');
      expect(isSupabaseInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      const { initSupabase, isSupabaseInitialized } = await import('./client');
      initSupabase({
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
      });
      expect(isSupabaseInitialized()).toBe(true);
    });
  });

  describe('setLicenseKey / getLicenseKey', () => {
    it('should return null by default', async () => {
      const { getLicenseKey } = await import('./client');
      expect(getLicenseKey()).toBeNull();
    });

    it('should set and get a license key', async () => {
      const { setLicenseKey, getLicenseKey } = await import('./client');
      setLicenseKey('my-license-123');
      expect(getLicenseKey()).toBe('my-license-123');
    });

    it('should clear the license key when set to null', async () => {
      const { setLicenseKey, getLicenseKey } = await import('./client');
      setLicenseKey('my-license-123');
      setLicenseKey(null);
      expect(getLicenseKey()).toBeNull();
    });
  });
});
