// Wires the rules in guardRules.ts to a browser context. Nothing here decides anything: every
// branch is an answer decideRequest or decideSocket gave. The types are structural so the
// wiring can be driven by fakes in src/test/scripts/landingCaptureGuard.test.ts.
import { decideRequest, decideSocket, rangeHeaders, rpcName, stopMessage } from './guardRules.ts';

type FetchedResponse = { headers(): Record<string, string>; json(): Promise<unknown> };

/** The part of Playwright's Route the guard uses. */
export type GuardRoute<R extends FetchedResponse = FetchedResponse> = {
  request(): { url(): string; method(): string; postDataJSON(): unknown };
  abort(errorCode?: string): Promise<void>;
  fallback(): Promise<void>;
  fetch(options?: { url?: string; method?: string }): Promise<R>;
  fulfill(options: {
    status?: number;
    json?: unknown;
    response?: R;
    headers?: Record<string, string>;
  }): Promise<void>;
};

/** The part of Playwright's WebSocketRoute the guard uses. It never calls connectToServer. */
export type GuardSocket = { url(): string };

/** The part of Playwright's BrowserContext the guard uses. */
export type GuardContext<R extends FetchedResponse = FetchedResponse> = {
  route(
    url: (url: URL) => boolean,
    handler: (route: GuardRoute<R>) => Promise<void>
  ): Promise<unknown>;
  routeWebSocket(url: (url: URL) => boolean, handler: (ws: GuardSocket) => void): Promise<unknown>;
};

/** Rewrites the rows of the reads whose path matches `paths`; every other read is untouched. */
export type JsonPatch = { paths: RegExp; rows: (body: unknown) => unknown };

export type Guard = {
  /** Writes to the local stack that were refused, for the run's log. */
  refused: string[];
  /** Requests to hosts off this machine that were refused, for the run's log. */
  blocked: string[];
  /** WebSockets the page opened. None was connected to a server. */
  heldSockets: string[];
  /** Throws once any request or socket has targeted a hosted Supabase project. */
  assertIsolated(): void;
  /** True cuts every request off, as if the device had no signal. Writes stay refused after. */
  setCutOff(cutOff: boolean): void;
  /**
   * Answer one write RPC inside the browser, as if the server had accepted it. `answer` gets
   * the arguments the app sent and returns the JSON the app receives; the request never
   * leaves the browser.
   */
  stageRpcAnswer(name: string, answer: (args: unknown) => unknown): void;
};

/**
 * A count probe is a HEAD with no body to patch. Read the same rows with a GET, run them
 * through the patch, and report the count the patched list would have.
 */
async function patchedCount<R extends FetchedResponse>(
  route: GuardRoute<R>,
  url: URL,
  rows: JsonPatch['rows']
) {
  const rowsUrl = new URL(url);
  rowsUrl.searchParams.set('select', '*');
  const [res, all] = await Promise.all([
    route.fetch(),
    route.fetch({ url: rowsUrl.toString(), method: 'GET' }),
  ]);
  const before: unknown = await all.json().catch(() => null);
  return route.fulfill({
    response: res,
    headers: rangeHeaders(res.headers(), before, rows(before)),
  });
}

async function patchedRead<R extends FetchedResponse>(
  route: GuardRoute<R>,
  rows: JsonPatch['rows']
) {
  const res = await route.fetch();
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return route.fulfill({ response: res });
  }
  const patched = rows(body);
  return route.fulfill({
    response: res,
    json: patched,
    headers: rangeHeaders(res.headers(), body, patched),
  });
}

/**
 * Install the guard on a context: every request and every WebSocket the context's pages make
 * goes through guardRules.ts. `devOrigin` comes from devServerOrigin().
 */
export async function installGuard<R extends FetchedResponse>(
  ctx: GuardContext<R>,
  options: { devOrigin: string; patch?: JsonPatch | undefined }
): Promise<Guard> {
  const { devOrigin, patch } = options;
  let cutOff = false;
  let stopped: string | undefined;
  const staged = new Map<string, (args: unknown) => unknown>();
  const refused: string[] = [];
  const blocked: string[] = [];
  const heldSockets: string[] = [];

  await ctx.route(
    () => true,
    async route => {
      const req = route.request();
      const method = req.method();
      const target = req.url();
      const bare = `${method} ${target.split('?')[0]}`;
      const decision = decideRequest({
        method,
        url: target,
        devOrigin,
        cutOff,
        stagedRpcs: staged,
        patchPaths: patch?.paths,
      });
      // Past 'stop-run' and 'block', decideRequest has already parsed the URL.
      switch (decision) {
        case 'dev-server':
        case 'pass':
          return route.fallback();
        case 'stop-run':
          stopped ??= bare;
          return route.abort('blockedbyclient');
        case 'block':
          blocked.push(bare);
          return route.abort('blockedbyclient');
        case 'offline':
          return route.abort('internetdisconnected');
        case 'refuse-write':
          refused.push(`${method} ${new URL(target).pathname}`);
          return route.abort('failed');
        case 'answer': {
          const answer = staged.get(rpcName(new URL(target).pathname) ?? '');
          if (!answer) return route.abort('failed');
          return route.fulfill({ status: 200, json: answer(req.postDataJSON()) });
        }
        case 'patch': {
          if (!patch) return route.abort('failed');
          const url = new URL(target);
          const run =
            method === 'HEAD'
              ? patchedCount(route, url, patch.rows)
              : patchedRead(route, patch.rows);
          return run.catch(() => route.abort('failed'));
        }
      }
    }
  );

  // Every WebSocket, the dev server's own included. The handler never calls connectToServer,
  // so the page gets a socket that is open in the browser and attached to nothing: no frame
  // the app sends reaches a server, and none arrives.
  await ctx.routeWebSocket(
    () => true,
    ws => {
      const url = ws.url().split('?')[0] ?? '';
      if (decideSocket(ws.url()) === 'stop-run') stopped ??= `a WebSocket to ${url}`;
      heldSockets.push(url);
    }
  );

  return {
    refused,
    blocked,
    heldSockets,
    assertIsolated() {
      if (stopped !== undefined) throw new Error(stopMessage(stopped));
    },
    setCutOff(next) {
      cutOff = next;
    },
    stageRpcAnswer(name, answer) {
      staged.set(name, answer);
    },
  };
}
