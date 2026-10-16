import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/**
 * A static server for the built `dist/` that can fail ONE lazy route chunk on demand (MYK9-1188).
 *
 * Why not `page.route`: a request the service worker makes is invisible to it, and the failure under
 * test lives on exactly that hop (service worker -> network). Why not `vite preview`: it cannot fail
 * a request. This mirrors Vercel's rewrite (any path that is not a file answers `index.html`), which
 * is what turns a vanished hashed chunk into a `text/html` module response in production.
 *
 * Every response is `no-store`, so the browser's HTTP cache cannot answer a request the test means
 * the network to see.
 */

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

export const DIST_DIR = resolve(process.cwd(), 'dist');

/** The hashed file name of a built lazy chunk, e.g. `FeesPage-DgTVMmBP.js`. */
export function findChunk(prefix: string): string {
  const dir = join(DIST_DIR, 'assets', 'scripts');
  const hit = readdirSync(dir).find(name => name.startsWith(`${prefix}-`) && name.endsWith('.js'));
  if (!hit) throw new Error(`No built chunk starting with ${prefix}- in ${dir}; run pnpm build.`);
  return hit;
}

export interface ChunkFaultServer {
  origin: string;
  /** Answer the next `times` requests for `chunk` with a 503 (Infinity: until `clearFault`). */
  failChunk: (chunk: string, times: number) => void;
  clearFault: () => void;
  /** How many requests were answered with the injected 503. */
  faultsServed: () => number;
  close: () => Promise<void>;
}

export async function startChunkFaultServer(): Promise<ChunkFaultServer> {
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    throw new Error(`${DIST_DIR} has no index.html; build the app before running this spec.`);
  }
  let faultChunk: string | null = null;
  let faultsLeft = 0;
  let served = 0;

  const server: Server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (faultChunk && faultsLeft > 0 && pathname.endsWith(`/${faultChunk}`)) {
      faultsLeft -= 1;
      served += 1;
      res.writeHead(503, { 'Cache-Control': 'no-store' }).end('injected chunk failure');
      return;
    }
    const requested = join(DIST_DIR, pathname);
    const isFile =
      requested.startsWith(DIST_DIR) && existsSync(requested) && statSync(requested).isFile();
    const file = isFile ? requested : join(DIST_DIR, 'index.html');
    res
      .writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .end(readFileSync(file));
  });

  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('chunk fault server has no port');
  // `localhost`, not 127.0.0.1: both are secure contexts, but the app's own origin checks use it.
  const origin = `http://localhost:${address.port}`;

  return {
    origin,
    failChunk: (chunk, times) => {
      faultChunk = chunk;
      faultsLeft = times;
    },
    clearFault: () => {
      faultChunk = null;
      faultsLeft = 0;
    },
    faultsServed: () => served,
    close: () => new Promise<void>(done => server.close(() => done())),
  };
}
