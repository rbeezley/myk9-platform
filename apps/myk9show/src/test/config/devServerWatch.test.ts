// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, loadConfigFromFile } from 'vite';
import { expect, it, vi } from 'vitest';

it('does not force CPU-intensive polling over Vite native file watching', async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development' },
    resolve(process.cwd(), 'vite.config.ts')
  );

  expect(loaded).not.toBeNull();
  // Leave platform defaults and CHOKIDAR_USEPOLLING opt-in to Vite/Chokidar.
  expect(loaded?.config.server?.watch?.usePolling).toBeUndefined();
  expect(loaded?.config.server?.hmr).not.toBe(false);
});

it('still observes source-file changes with the configured native watcher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'myk9-native-watch-'));
  const probe = join(root, 'probe.ts');
  await writeFile(probe, 'export const version = 1;');
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    server = await createServer({
      configFile: resolve(process.cwd(), 'vite.config.ts'),
      root,
      cacheDir: join(root, '.vite'),
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, warmup: { clientFiles: [] } },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const changed = vi.fn();
    server.watcher.on('change', changed);
    await vi.waitFor(() => {
      const watched = Object.values(server!.watcher.getWatched()).flat();
      expect(watched).toContain('probe.ts');
    });
    await writeFile(probe, 'export const version = 2;');
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(probe), { timeout: 3000 });
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
