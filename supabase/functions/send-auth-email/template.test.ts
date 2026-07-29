import { describe, expect, it } from 'vitest';

import { buildAuthEmailHtml } from './template.ts';

describe('buildAuthEmailHtml', () => {
  it('uses the accessible terracotta brand color and hosted myK9Show logo', () => {
    const { html } = buildAuthEmailHtml(
      'magiclink',
      'Richard',
      'https://myk9show.com/auth/callback?token_hash=abc'
    );

    expect(html.match(/background-color: #a8472d/g)).toHaveLength(2);
    expect(html).not.toContain('#2563eb');
    expect(html).toContain('src="https://myk9show.com/pwa-192x192.png"');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="44"');
    expect(html).toContain('height="44"');
    expect(html).toContain('>myK9Show</p>');
  });

  it('escapes personalized content and action URLs', () => {
    const { html } = buildAuthEmailHtml(
      'signup',
      '<Richard & friends>',
      'https://myk9show.com/auth/callback?next="/clubs"&token=a&b'
    );

    expect(html).toContain('Hi &lt;Richard &amp; friends&gt;');
    expect(html).toContain(
      'href="https://myk9show.com/auth/callback?next=&quot;/clubs&quot;&amp;token=a&amp;b"'
    );
  });
});
