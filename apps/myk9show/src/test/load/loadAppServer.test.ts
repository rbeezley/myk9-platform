import { describe, expect, it } from 'vitest';
import { scripts as packageScripts } from '../../../package.json';
import { loadAppServerCommand, resolveLoadAppServerMode } from './loadAppServer';

describe('load app server selection', () => {
  it('defaults to the dev server for local runs', () => {
    expect(resolveLoadAppServerMode({})).toBe('dev');
    expect(resolveLoadAppServerMode({ LOAD_TEST_APP_SERVER: 'dev' })).toBe('dev');
  });

  it('treats an empty value as unset, not as an invalid mode', () => {
    // An unset `${{ vars.X }}` expands to '' in a workflow env block.
    expect(resolveLoadAppServerMode({ LOAD_TEST_APP_SERVER: '' })).toBe('dev');
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

  // Pinning the command string only proves someone typed it; these assert the
  // script the command resolves to is one this package can actually run.
  it.each(['dev', 'preview'] as const)('%s mode runs a real package script', mode => {
    const script = loadAppServerCommand(mode, 5173).match(/pnpm run (\S+)/)?.[1];
    expect(Object.keys(packageScripts)).toContain(script);
  });

  it.each([0, -1, 1.5, 65_536, Number.NaN])('rejects invalid port %p', port => {
    expect(() => loadAppServerCommand('dev', port)).toThrow('valid TCP port');
  });

  // Without these the guard could be tightened to reject the legal extremes and
  // every other test would still pass.
  it.each([1, 5173, 65_535])('accepts valid port %p', port => {
    expect(() => loadAppServerCommand('dev', port)).not.toThrow();
  });
});
