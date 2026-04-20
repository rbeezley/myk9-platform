import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('apps/myk9q/index.html', () => {
  let html: string;

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
  });

  it('preconnects to fonts.googleapis.com for Fraunces', () => {
    expect(html).toMatch(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/);
  });

  it('preconnects to fonts.gstatic.com with crossorigin', () => {
    expect(html).toMatch(
      /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin/
    );
  });

  it('loads Fraunces with variable optical-size axis and display=swap', () => {
    expect(html).toMatch(
      /fonts\.googleapis\.com\/css2\?[^"]*family=Fraunces[^"]*opsz[^"]*display=swap/
    );
  });

  it('keeps self-hosted Montserrat (no regression)', () => {
    expect(html).toMatch(/href="\/fonts\/fonts\.css"/);
  });

  // FOUC-prevention inline style paints before any external CSS loads. If its
  // canvas color drifts from the v2 tokens, users see a 50–200ms flash of the
  // old color on first paint — most visible on cold loads. Pin the values.
  it('FOUC inline style uses v2 parchment canvas for light mode', () => {
    expect(html).toMatch(
      /html,\s*body,\s*#root,\s*\.page-loader-container\s*\{\s*background-color:\s*#faf7f2;/
    );
  });

  it('FOUC inline style uses v2 warm-olive canvas for .theme-dark', () => {
    expect(html).toMatch(
      /\.theme-dark[\s\S]*?\{\s*background-color:\s*#181411;/
    );
  });
});
