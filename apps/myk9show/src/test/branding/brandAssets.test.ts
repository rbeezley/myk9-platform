import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = process.cwd();

function readPngDimensions(relativePath: string): { width: number; height: number } {
  const bytes = readFileSync(join(appRoot, relativePath));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('myK9Show brand assets', () => {
  it.each([
    ['public/favicon-16x16.png', 16],
    ['public/favicon-32x32.png', 32],
    ['public/apple-touch-icon.png', 180],
    ['public/pwa-192x192.png', 192],
    ['public/pwa-512x512.png', 512],
    ['public/pwa-maskable-512x512.png', 512],
    ['public/notification-badge-96.png', 96],
    ['public/brand-mark-28.png', 28],
    ['public/brand-mark-56.png', 56],
    ['public/brand-mark-84.png', 84],
    ['public/brand-mark-primary-72.png', 72],
    ['public/brand-mark-primary-144.png', 144],
    ['public/brand-mark-primary-216.png', 216],
    ['public/brand-mark-64.png', 64],
    ['public/brand-mark-128.png', 128],
    ['public/logo.png', 1024],
  ])('provides %s at the required square size', (path, size) => {
    expect(readPngDimensions(path)).toEqual({ width: size, height: size });
  });

  it('references the dedicated browser and Apple icons', () => {
    const html = readFileSync(join(appRoot, 'index.html'), 'utf8');
    expect(html).toContain('href="/favicon-32x32.png"');
    expect(html).toContain('href="/favicon-16x16.png"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });

  it('uses the terracotta brand color in the static manifest', () => {
    const manifest = JSON.parse(readFileSync(join(appRoot, 'public/manifest.json'), 'utf8')) as {
      theme_color: string;
      background_color: string;
    };

    expect(manifest.theme_color).toBe('#c96442');
    expect(manifest.background_color).toBe('#f5f4ed');
  });

  it('uses a dedicated padded icon for maskable PWA contexts', () => {
    const manifest = JSON.parse(readFileSync(join(appRoot, 'public/manifest.json'), 'utf8')) as {
      icons: Array<{ src: string; purpose?: string }>;
    };

    expect(manifest.icons).toContainEqual(
      expect.objectContaining({
        src: '/pwa-maskable-512x512.png',
        purpose: 'maskable',
      })
    );
  });

  it('keeps the checked-in manifest as the single PWA manifest source', () => {
    const viteConfig = readFileSync(join(appRoot, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('manifest: false');
    expect(viteConfig).not.toContain('brand-concepts');
  });

  it('keeps a WebP logo fallback for the landing hero', () => {
    expect(statSync(join(appRoot, 'public/logo.webp')).size).toBeGreaterThan(1_000);
  });

  it('encodes the transparent WebP losslessly to avoid dark-mode edge fringing', () => {
    const webp = readFileSync(join(appRoot, 'public/logo.webp'));

    expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webp.includes(Buffer.from('VP8L'))).toBe(true);
  });

  it('uses the approved vector logo in the public landing header and sign-in card', () => {
    const header = readFileSync(
      join(appRoot, 'src/components/landing/v2/LandingHeader.tsx'),
      'utf8'
    );
    const signIn = readFileSync(join(appRoot, 'src/pages/SmartSignInPage.tsx'), 'utf8');
    expect(header).toContain('src="/logo.svg"');
    expect(signIn).toContain('src="/logo.svg"');
  });

  it.each(['logo.svg', 'brand-mark.svg', 'brand-mark-primary.svg'])(
    'ships %s as self-contained vector paths',
    name => {
      const svg = readFileSync(join(appRoot, 'public', name), 'utf8');
      expect(svg).toContain('<path');
      expect(svg).toContain('<title>myK9Show</title>');
      expect(svg).not.toMatch(/<image\b|<text\b|data:image|font-family/);
    }
  );

  it('uses density-aware primary PNGs in the About dialog', () => {
    const aboutDialog = readFileSync(
      join(appRoot, 'src/components/common/AboutDialog.tsx'),
      'utf8'
    );

    expect(aboutDialog).toContain('src="/brand-mark-primary-72.png"');
    expect(aboutDialog).toContain(
      'srcSet="/brand-mark-primary-72.png 1x, /brand-mark-primary-144.png 2x, /brand-mark-primary-216.png 3x"'
    );
    expect(aboutDialog).not.toContain('src="/pwa-192x192.png"');
  });

  it('uses the dedicated monochrome notification badge everywhere', () => {
    const websocket = readFileSync(join(appRoot, 'src/context/WebSocketContext.tsx'), 'utf8');
    const serviceWorker = readFileSync(join(appRoot, 'src/sw-custom.ts'), 'utf8');
    const viteConfig = readFileSync(join(appRoot, 'vite.config.ts'), 'utf8');

    expect(websocket).toContain("badge: '/notification-badge-96.png'");
    expect(serviceWorker).toContain("badge: '/notification-badge-96.png'");
    expect(viteConfig).not.toContain("'mask-icon.svg'");
  });
});
