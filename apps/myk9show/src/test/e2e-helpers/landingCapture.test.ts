import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OUTBOUND_PROBE,
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
