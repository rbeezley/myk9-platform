import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';

// What the landing capture (capture/landingRingCapture.spec.ts, MYK9-2181) needs besides the
// e2e suite's own helpers. The capture is safe by where it runs, not by sorting its requests:
// the database is the job's own and is thrown away, and the job closes the outbound network
// for the capture's processes. These helpers prove that closure and stand in for the one
// thing a closed network takes away from the page, its web fonts.

/**
 * A host the runner can reach when its network is open, so "refused" means the network is
 * closed and nothing else. Never a Supabase host.
 */
export const OUTBOUND_PROBE = { host: 'api.github.com', port: 443 } as const;

export type OutboundResult =
  /** The connection opened: the network is open. */
  | 'connected'
  /** The connection was refused at once, which is what the job's firewall rule answers. */
  | 'refused'
  /** Anything else (no answer, no name): proves nothing either way. */
  | 'unknown';

/** Try one TCP connection and say how it ended. Sends nothing. */
export function probeOutbound(
  host: string,
  port: number,
  timeoutMs = 8000
): Promise<OutboundResult> {
  return new Promise(resolve => {
    const socket = connect({ host, port });
    const done = (result: OutboundResult) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done('unknown'));
    socket.once('connect', () => done('connected'));
    socket.once('error', (error: NodeJS.ErrnoException) =>
      done(error.code === 'ECONNREFUSED' ? 'refused' : 'unknown')
    );
  });
}

/**
 * Why a probe result is not the one expected, or null when it is. A capture needs 'refused';
 * the job's control, run before the network is closed, needs 'connected', which shows the
 * probe can tell the two apart on this runner.
 */
export function outboundProblem(
  expected: 'connected' | 'refused',
  result: OutboundResult
): string | null {
  if (result === expected) return null;
  if (expected === 'refused') {
    return result === 'connected'
      ? 'The capture can reach the internet. It runs only with its outbound network closed (the Landing capture workflow does that); nothing was signed in.'
      : 'The outbound probe got no clear answer, so the network is not proved closed; nothing was signed in.';
  }
  return `The control probe did not connect (${result}), so a refusal later would prove nothing.`;
}

export type CaptureStart = {
  /** GITHUB_ACTIONS: the capture runs in its workflow and nowhere else. */
  inWorkflow: boolean;
  /** MYK9_ALLOW_PROD_E2E is set to anything: the opt-in other suites honor. */
  productionOptIn: boolean;
  /** VITE_SUPABASE_URL as the test process sees it. */
  supabaseUrl: string | undefined;
  /** Whether the built bundle the preview serves was found where it was looked for. */
  bundleFound: boolean;
  /** How many script files of that bundle name the production project. */
  bundleFilesNamingProduction: number;
  /** What the outbound probe answered. */
  outbound: OutboundResult;
};

/**
 * Why the capture may not start, or null when it may. Every condition must hold; none can
 * be waived. The production opt-in is refused outright, so the switch that lets other suites
 * sign fixture accounts in to production does nothing for a capture except stop it.
 */
export function captureStartProblem(start: CaptureStart): string | null {
  if (!start.inWorkflow) {
    return 'The landing capture runs in the Landing capture workflow only.';
  }
  if (start.productionOptIn) {
    return 'MYK9_ALLOW_PROD_E2E is set. A capture never runs against the production project; unset it.';
  }
  let host: string | undefined;
  try {
    host = start.supabaseUrl ? new URL(start.supabaseUrl).hostname : undefined;
  } catch {
    host = undefined;
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return 'The landing capture runs against an isolated Supabase stack on this machine only.';
  }
  if (!start.bundleFound) {
    return 'No built bundle was found to check; run the capture from apps/myk9show after the build.';
  }
  if (start.bundleFilesNamingProduction > 0) {
    return `The served bundle was built against the production project (${start.bundleFilesNamingProduction} file(s) name it). Rebuild against the isolated stack.`;
  }
  return outboundProblem('refused', start.outbound);
}

// --- Fonts ---------------------------------------------------------------------------------

const FONT_CSS_HOST = 'fonts.googleapis.com';
const FONT_FILE_HOST = 'fonts.gstatic.com';
export const FONT_STYLESHEET_FILE = 'fonts.css';
export const FONT_MANIFEST_FILE = 'manifest.json';

/** The Google Fonts stylesheet index.html links, with HTML entities undone. */
export function fontStylesheetUrl(indexHtml: string): string {
  const href = indexHtml.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/)?.[1];
  if (!href) throw new Error('index.html links no fonts.googleapis.com stylesheet');
  return href.replaceAll('&amp;', '&');
}

/** Every font file a Google Fonts stylesheet names, once each. */
export function fontFileUrls(css: string): string[] {
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(
    match => match[1] ?? ''
  );
  return [...new Set(urls)];
}

/**
 * Answer the page's font requests from files the job downloaded before it closed the
 * network (capture/downloadFonts.ts), so the captures are set in the app's own
 * fonts. A font file the stylesheet did not name is refused, not fetched.
 */
export async function serveFontsFrom(context: BrowserContext, dir: string): Promise<void> {
  const cssFile = join(dir, FONT_STYLESHEET_FILE);
  const manifestFile = join(dir, FONT_MANIFEST_FILE);
  if (!existsSync(cssFile) || !existsSync(manifestFile)) {
    throw new Error(`No downloaded fonts in ${dir}; run capture/downloadFonts.ts first`);
  }
  const css = readFileSync(cssFile, 'utf8');
  const files = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, string>;
  await context.route(`https://${FONT_CSS_HOST}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: css })
  );
  await context.route(`https://${FONT_FILE_HOST}/**`, route => {
    const file = files[route.request().url()];
    if (!file) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      body: readFileSync(join(dir, file)),
    });
  });
}
