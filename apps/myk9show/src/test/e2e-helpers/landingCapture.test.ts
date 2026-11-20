import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOW_PRODUCTION_FIXTURE_SIGN_IN,
  PRODUCTION_PROJECT_REF,
} from '../productionFixtureGuard';
import {
  OUTBOUND_PROBE,
  captureStartProblem,
  type CaptureStart,
  fontFileUrls,
  fontStylesheetUrl,
  outboundProblem,
  probeOutbound,
} from '../e2e/helpers/landingCapture';

// Known answers for the landing capture's helpers (MYK9-2181). The probe is tried against
// this machine only: a port that listens and a port that does not.

describe('probeOutbound', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  const listen = () =>
    new Promise<number>(resolve => {
      const server = createServer(socket => socket.destroy());
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });

  it('says connected when something answers', async () => {
    expect(await probeOutbound('127.0.0.1', await listen())).toBe('connected');
  });

  it('says refused when nothing listens', async () => {
    const port = await listen();
    for (const server of servers.splice(0)) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    expect(await probeOutbound('127.0.0.1', port)).toBe('refused');
  });

  it('says unknown, not refused, when the name does not resolve', async () => {
    expect(await probeOutbound('capture-probe.invalid', 443, 4000)).toBe('unknown');
  });

  it('never probes a Supabase host', () => {
    expect(OUTBOUND_PROBE.host).not.toMatch(/supabase/);
  });
});

describe('outboundProblem', () => {
  it('lets a capture run only when the connection was refused', () => {
    expect(outboundProblem('refused', 'refused')).toBeNull();
    expect(outboundProblem('refused', 'connected')).toMatch(/can reach the internet/);
    expect(outboundProblem('refused', 'unknown')).toMatch(/not proved closed/);
  });

  it('accepts the control only when the connection opened', () => {
    expect(outboundProblem('connected', 'connected')).toBeNull();
    expect(outboundProblem('connected', 'refused')).toMatch(/would prove nothing/);
    expect(outboundProblem('connected', 'unknown')).toMatch(/would prove nothing/);
  });
});

describe('captureStartProblem', () => {
  const ready: CaptureStart = {
    inWorkflow: true,
    productionOptIn: false,
    supabaseUrl: 'http://127.0.0.1:54321',
    bundleFound: true,
    bundleFilesNamingProduction: 0,
    outbound: 'refused',
  };

  it('lets the capture start only when every condition holds', () => {
    expect(captureStartProblem(ready)).toBeNull();
    expect(captureStartProblem({ ...ready, supabaseUrl: 'http://localhost:54321' })).toBeNull();
  });

  it.each([
    [{ inWorkflow: false }, /workflow only/],
    [{ productionOptIn: true }, /MYK9_ALLOW_PROD_E2E is set/],
    [{ supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }, /isolated Supabase stack/],
    [{ supabaseUrl: 'https://someotherproject.supabase.co' }, /isolated Supabase stack/],
    [{ supabaseUrl: 'http://127.0.0.1.example.com:54321' }, /isolated Supabase stack/],
    [{ supabaseUrl: 'not a url' }, /isolated Supabase stack/],
    [{ supabaseUrl: undefined }, /isolated Supabase stack/],
    [{ bundleFound: false }, /No built bundle was found/],
    [{ bundleFilesNamingProduction: 1 }, /built against the production project/],
    [{ outbound: 'connected' as const }, /can reach the internet/],
    [{ outbound: 'unknown' as const }, /not proved closed/],
  ])('refuses %j', (change, message) => {
    expect(captureStartProblem({ ...ready, ...change })).toMatch(message);
  });

  it('is not waived by the production opt-in, whatever else is true', () => {
    // The switch that lets other suites sign fixture accounts in to production stops a capture.
    expect(captureStartProblem({ ...ready, productionOptIn: true })).not.toBeNull();
    expect(
      captureStartProblem({
        ...ready,
        productionOptIn: true,
        supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        outbound: 'connected',
      })
    ).not.toBeNull();
  });
});

// The conditions above only protect anything if the spec asks them and the job runs the spec
// the way the plan says. These pin both, so loosening either fails here.
describe('the capture spec and its job', () => {
  const app = resolve(__dirname, '../../..');
  /** A file without its comment lines, so a rule that is only commented out does not pass. */
  const code = (file: string, marks: string[]) =>
    readFileSync(resolve(app, file), 'utf8')
      .split('\n')
      .filter(line => !marks.some(mark => line.trim().startsWith(mark)))
      .join('\n');
  const spec = code('src/test/e2e/capture/landingRingCapture.spec.ts', ['//', '/*', '*']);
  const entriesSpec = code('src/test/e2e/capture/landingSceneEntriesCapture.spec.ts', [
    '//',
    '/*',
    '*',
  ]);
  const specs = { ring: spec, entries: entriesSpec };
  const workflow = code('../../.github/workflows/landing-capture.yml', ['#']);

  it.each(Object.entries(specs))(
    'skips outside the capture job and asks every start condition before any test (%s)',
    (_name, text) => {
      expect(text).toMatch(/test\.skip\(\s*process\.env\.PLAYWRIGHT_LANDING_CAPTURE !== 'true',/);
      const beforeAll = text.slice(
        text.indexOf('test.beforeAll('),
        text.indexOf("test('no WebSocket")
      );
      expect(beforeAll).toMatch(/captureStartProblem\(\{/);
      for (const fact of [
        "inWorkflow: process.env.GITHUB_ACTIONS === 'true'",
        'productionOptIn: process.env[ALLOW_PRODUCTION_FIXTURE_SIGN_IN] !== undefined',
        'supabaseUrl: process.env.VITE_SUPABASE_URL',
        "bundleFound: existsSync(join(APP_DIR, 'dist', 'index.html'))",
        "bundleFilesNamingProduction: bundleFilesNamingProduction(join(APP_DIR, 'dist')).length",
        'outbound: await probeOutbound(OUTBOUND_PROBE.host, OUTBOUND_PROBE.port)',
      ]) {
        expect(beforeAll, fact).toContain(fact);
      }
      expect(beforeAll).toMatch(/if \(problem\) throw new Error\(problem\);/);
      expect(text).not.toMatch(/connectToServer/);
    }
  );

  it('signs in only after the hold is installed on the capture’s own contexts', () => {
    // The ring capture signs one account in; the Entries capture signs two, one per device.
    expect(spec.match(/signInAsJudge\(/g)).toHaveLength(1);
    expect(spec.indexOf('await holdWebSockets(context)')).toBeGreaterThan(0);
    expect(spec.indexOf('await holdWebSockets(context)')).toBeLessThan(
      spec.indexOf('signInAsJudge(')
    );
    expect(entriesSpec.match(/\bsignIn(AsSecretary)?\(/g)).toHaveLength(2);
    const firstSignIn = entriesSpec.search(/\bsignIn(AsSecretary)?\(/);
    expect(entriesSpec.indexOf('await holdWebSockets(context)')).toBeGreaterThan(0);
    expect(entriesSpec.indexOf('await holdWebSockets(context)')).toBeLessThan(firstSignIn);
    expect(entriesSpec.indexOf('await holdWebSockets(deskContext)')).toBeGreaterThan(0);
    expect(entriesSpec.indexOf('await holdWebSockets(deskContext)')).toBeLessThan(firstSignIn);
    // Both contexts are served the downloaded fonts, and no page is opened before that.
    expect(entriesSpec.indexOf('await serveFontsFrom(deskContext, fontsDir)')).toBeLessThan(
      entriesSpec.indexOf('deskContext.newPage()')
    );
    // The job's database is set up only after the target is shown to be on this machine, and
    // before any page opens.
    const setup = entriesSpec.indexOf("execFileSync('psql'");
    expect(setup).toBeGreaterThan(0);
    expect(entriesSpec.indexOf("['127.0.0.1', 'localhost']")).toBeLessThan(setup);
    expect(setup).toBeLessThan(entriesSpec.indexOf('await serveFontsFrom(context, fontsDir)'));
    // The card checkout is Stripe's page, which this job cannot reach and must never press.
    expect(entriesSpec).not.toMatch(
      /\.click\(\)[^;]*\bpay\b|clickClearOfStickyChrome\(page, pay\)/
    );
    expect(entriesSpec).not.toMatch(/stripe/i);
  });

  it('closes the network for both address families before the control and the capture', () => {
    const rule = workflow.indexOf('-m owner --gid-owner landing-capture -j REJECT');
    const control = workflow.indexOf('capture/egressProbe.ts open');
    const confined = workflow.indexOf(
      "sg landing-capture -c 'pnpm exec tsx src/test/e2e/capture/egressProbe.ts closed'"
    );
    const capture = workflow.indexOf("'pnpm exec playwright test --config=playwright.ci.config.ts");
    expect(workflow).toMatch(/for firewall in iptables ip6tables; do/);
    // The one thing the group is let through to is the loopback interface.
    const accepts = workflow.split('\n').filter(line => line.includes('-j ACCEPT'));
    expect(accepts.map(line => line.trim())).toEqual([
      'sudo "$firewall" -A OUTPUT -m owner --gid-owner landing-capture -o lo -j ACCEPT',
    ]);
    // The job makes its own account passwords and is given none of the repository's.
    expect(workflow).not.toMatch(/secrets\.E2E_/);
    expect(workflow).toMatch(/value="Job-\$\(openssl rand -hex 16\)-9a"/);
    expect(rule).toBeGreaterThan(0);
    expect(control).toBeGreaterThan(rule);
    expect(confined).toBeGreaterThan(control);
    expect(capture).toBeGreaterThan(confined);
    // The capture itself runs in the confined group, with no retries and no production opt-in.
    expect(workflow.slice(confined, capture)).toMatch(/sg landing-capture -c\s+$/);
    expect(workflow).toMatch(/--retries=0 --workers=1'/);
    expect(workflow).not.toContain(ALLOW_PRODUCTION_FIXTURE_SIGN_IN);
    expect(workflow).toMatch(/MYK9_E2E_LOAD_FIXTURE: 'false'/);
  });

  it('uploads only what this run took: an empty output folder, then every file of both scenes', () => {
    // Neither spec writes over the checked-in copies, and each refuses its own folder if it exists.
    for (const text of [spec, entriesSpec]) {
      expect(text).toMatch(/join\(process\.env\.CAPTURE_OUT_DIR \?\? '', 'apps', 'myk9show'\)/);
      expect(text).toMatch(
        /if \(existsSync\(IMG_DIR\) \|\| existsSync\(REGIONS_FILE\)\) \{\s+throw new Error\(/
      );
      expect(text).not.toMatch(/join\(APP_DIR, '(public|src)'/);
      expect(text).toMatch(/expect\(loadedFaces\)\.toContain\('Montserrat'\);/);
      expect(text).not.toMatch(/document\.fonts\.check\(/);
    }
    // The job copies nothing from the checkout into the artifact, and counts the files.
    expect(workflow).not.toMatch(/\bcp\b/);
    expect(workflow).toMatch(/CAPTURE_OUT_DIR: \$\{\{ runner\.temp \}\}\/landing-capture\/out/);
    expect(workflow).toMatch(
      /for shot in classes offline sheet running result confirm saved sent; do\s+test -s /
    );
    expect(workflow).toMatch(
      /for shot in phone-dogs phone-classes phone-payment phone-pending phone-accepted desk-before desk-list desk-review desk-accepted; do\s+test -s /
    );
    expect(workflow).toMatch(/scenes\/entries" -type f \| wc -l\)" -eq 9/);
    expect(workflow).toMatch(/landing-capture\/out" -type f \| wc -l\)" -eq 19/);
    expect(workflow.indexOf('Check the capture is whole')).toBeLessThan(
      workflow.indexOf('Upload the capture')
    );
    // The captures are set in a font face that really loaded (checked in both specs above).
  });

  it('runs on a pull request that changes anything the capture depends on', () => {
    // MYK9-2188: the capture mode, the stack's lifecycle and the seeded class and dog are
    // outside the capture's own folder, and each one that exists can break the capture.
    const filter = workflow.slice(workflow.indexOf('pull_request:'), workflow.indexOf('\nenv:'));
    const paths = filter
      .split('\n')
      .map(line => /^- '(.+)'$/.exec(line.trim())?.[1])
      .filter((path): path is string => path !== undefined);
    expect(paths).toEqual([
      'apps/myk9show/src/test/e2e/capture/**',
      'apps/myk9show/src/test/e2e/helpers/landingCapture.ts',
      '.github/workflows/landing-capture.yml',
      'apps/myk9show/playwright.ci.config.ts',
      'scripts/qa/isolated-e2e-lifecycle.ts',
      'supabase/seed-demo.sql',
    ]);
    for (const path of paths.filter(path => !path.includes('*'))) {
      expect(existsSync(resolve(app, '../..', path)), path).toBe(true);
    }
  });

  it('lists the capture spec in the capture mode only', () => {
    const config = readFileSync(resolve(app, 'playwright.ci.config.ts'), 'utf8');
    expect(config.match(/landingRingCapture/g)).toHaveLength(1);
    expect(config.match(/landingSceneEntriesCapture/g)).toHaveLength(1);
    expect(config).toMatch(
      /const LANDING_CAPTURE_SPECS = \[\s+'\*\*\/capture\/landingRingCapture\.spec\.ts',\s+'\*\*\/capture\/landingSceneEntriesCapture\.spec\.ts',\s+\];/
    );
    expect(config).toMatch(/testMatch: isLandingCapture\s+\? LANDING_CAPTURE_SPECS/);
  });
});

describe('fonts', () => {
  it('finds the stylesheet index.html links', () => {
    const html =
      '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@300..700&amp;family=Montserrat:wght@400;700&amp;display=swap" rel="stylesheet" />';
    expect(fontStylesheetUrl(html)).toBe(
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@300..700&family=Montserrat:wght@400;700&display=swap'
    );
    expect(() => fontStylesheetUrl('<html></html>')).toThrow(/links no fonts/);
  });

  it('lists each font file a stylesheet names once', () => {
    const css = `
      @font-face { font-family: 'Montserrat'; src: url(https://fonts.gstatic.com/s/montserrat/v29/a.woff2) format('woff2'); }
      @font-face { font-family: 'Montserrat'; src: url(https://fonts.gstatic.com/s/montserrat/v29/b.woff2) format('woff2'); }
      @font-face { font-family: 'Montserrat'; src: url(https://fonts.gstatic.com/s/montserrat/v29/a.woff2) format('woff2'); }
      @font-face { font-family: 'Other'; src: url(https://example.com/c.woff2); }`;
    expect(fontFileUrls(css)).toEqual([
      'https://fonts.gstatic.com/s/montserrat/v29/a.woff2',
      'https://fonts.gstatic.com/s/montserrat/v29/b.woff2',
    ]);
  });
});
