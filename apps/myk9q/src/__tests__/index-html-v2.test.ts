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
});
