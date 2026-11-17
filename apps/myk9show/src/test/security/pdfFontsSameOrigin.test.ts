import { describe, expect, it, vi } from 'vitest';

// MYK9-2102: the premium PDF fetched its fonts from cdn.jsdelivr.net, which the
// production CSP's connect-src blocks, and one blocked font fails the whole render.
// Dev and e2e never apply the vercel.json headers, so this pins every registered
// font to our own origin, where connect-src 'self' already allows it.
const registered = vi.hoisted(() => [] as Array<{ family: string; src: string }>);

vi.mock('@react-pdf/renderer', () => ({
  Font: {
    register: ({ family, fonts }: { family: string; fonts: Array<{ src: string }> }) => {
      for (const font of fonts) registered.push({ family, src: font.src });
    },
  },
}));

describe('PDF font sources', () => {
  it('registers every font from our own origin, never a CDN', async () => {
    await import('@/features/premium/pdf/pdfFonts');

    expect(registered).toHaveLength(37);
    // A scheme (https:, data:) or a protocol-relative //host/ path both leave our origin.
    const offOrigin = registered.filter(({ src }) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src));
    expect(offOrigin).toEqual([]);
    for (const { src } of registered) {
      expect(src).toMatch(/\.woff$/);
    }
  });
});
