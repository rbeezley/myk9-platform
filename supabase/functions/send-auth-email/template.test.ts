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

  it('prints the one-time code in a magic-link email, for the step-up prompt (MYK9-1208)', () => {
    const url = 'https://myk9show.com/auth/callback?token_hash=abc';
    expect(buildAuthEmailHtml('magiclink', 'Richard', url, '123456').html).toContain(
      'Or enter this code: <strong style="font-size: 22px; letter-spacing: 4px;">123456</strong>'
    );
    expect(buildAuthEmailHtml('magiclink', 'Richard', url).html).not.toContain('enter this code');
    expect(buildAuthEmailHtml('signup', 'Richard', url, '123456').html).not.toContain('123456');
    expect(buildAuthEmailHtml('magiclink', 'Richard', url, '<b>1</b>').html).not.toContain(
      'enter this code'
    );
  });

  it('sends the password-change code with no sign-in link (MYK9-1208)', () => {
    const url = 'https://myk9show.com/auth/callback?token_hash=abc';
    const { subject, html } = buildAuthEmailHtml('reauthentication', 'Richard', url, '654321');
    expect(subject).toBe('Your myK9Show confirmation code');
    expect(html).toContain('654321');
    expect(html).not.toContain('href="https://myk9show.com/auth/callback');
  });
});
