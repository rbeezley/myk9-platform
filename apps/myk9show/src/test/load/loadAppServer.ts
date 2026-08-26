export type LoadAppServerMode = 'dev' | 'preview';

export function resolveLoadAppServerMode(env: NodeJS.ProcessEnv): LoadAppServerMode {
  // `||` not `??`: an unset GitHub expression expands to '', which must mean
  // "default", not an invalid mode.
  const mode = env.LOAD_TEST_APP_SERVER || 'dev';
  if (mode !== 'dev' && mode !== 'preview') {
    throw new Error(`LOAD_TEST_APP_SERVER must be "dev" or "preview"; received "${mode}".`);
  }
  return mode;
}

export function loadAppServerCommand(mode: LoadAppServerMode, port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Load app server port must be a valid TCP port; received ${port}.`);
  }
  return `pnpm run ${mode} --host 127.0.0.1 --port ${port} --strictPort`;
}
