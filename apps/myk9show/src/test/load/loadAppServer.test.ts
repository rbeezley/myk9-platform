import { describe, expect, it } from 'vitest';
import { loadAppServerCommand, resolveLoadAppServerMode } from './loadAppServer';

describe('load app server selection', () => {
  it('defaults to the dev server for local runs', () => {
    expect(resolveLoadAppServerMode({})).toBe('dev');
    expect(resolveLoadAppServerMode({ LOAD_TEST_APP_SERVER: 'dev' })).toBe('dev');
  });

  it('selects the production preview server when the rehearsal requests it', () => {
    expect(resolveLoadAppServerMode({ LOAD_TEST_APP_SERVER: 'preview' })).toBe('preview');
  });

  it('rejects unknown server modes instead of silently serving dev', () => {
    expect(() => resolveLoadAppServerMode({ LOAD_TEST_APP_SERVER: 'prod' })).toThrow(
      'LOAD_TEST_APP_SERVER must be "dev" or "preview"; received "prod".'
    );
  });

  it('serves the built bundle via vite preview in preview mode', () => {
    expect(loadAppServerCommand('preview', 5173)).toBe(
      'pnpm run preview --host 127.0.0.1 --port 5173 --strictPort'
    );
  });

  it('keeps the dev-server command shape for dev mode', () => {
    expect(loadAppServerCommand('dev', 4173)).toBe(
      'pnpm run dev --host 127.0.0.1 --port 4173 --strictPort'
    );
  });

  it.each([0, -1, 1.5, 65_536, Number.NaN])('rejects invalid port %p', port => {
    expect(() => loadAppServerCommand('dev', port)).toThrow('valid TCP port');
  });
});
