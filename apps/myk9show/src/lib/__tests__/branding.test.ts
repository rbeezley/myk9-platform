import { describe, it, expect } from 'vitest';
import { resolveShowBranding, generatePalette, PRESET_COLORS } from '../branding';

describe('resolveShowBranding', () => {
  const club = { logo: 'club-logo.png', coverImage: 'club-cover.png', accentColor: '#2563eb' };

  it('returns show overrides when present', () => {
    const show = {
      logoUrl: 'show-logo.png',
      coverImageUrl: 'show-cover.png',
      accentColor: '#dc2626',
    };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'show-logo.png',
      coverImage: 'show-cover.png',
      accentColor: '#dc2626',
    });
  });

  it('falls back to club values when show fields are null', () => {
    const show = { logoUrl: null, coverImageUrl: null, accentColor: null };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#2563eb',
    });
  });

  it('falls back to club values when show fields are undefined', () => {
    const show = {};
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#2563eb',
    });
  });

  it('returns all null when both show and club have no branding', () => {
    const result = resolveShowBranding({}, {});
    expect(result).toEqual({ logo: null, coverImage: null, accentColor: null });
  });

  it('handles partial overrides (show overrides only accent color)', () => {
    const show = { accentColor: '#16a34a' };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#16a34a',
    });
  });
});

describe('generatePalette', () => {
  it('returns all palette values for a valid hex color', () => {
    const palette = generatePalette('#2563eb');
    expect(palette).toHaveProperty('primary', '#2563eb');
    expect(palette).toHaveProperty('primaryLight');
    expect(palette).toHaveProperty('primaryDark');
    expect(palette).toHaveProperty('primaryMuted');
    expect(palette).toHaveProperty('onPrimary');
  });

  it('generates lighter shade for primaryLight', () => {
    const palette = generatePalette('#2563eb');
    expect(palette.primaryLight).not.toBe(palette.primary);
    expect(palette.primaryLight).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('generates darker shade for primaryDark', () => {
    const palette = generatePalette('#2563eb');
    expect(palette.primaryDark).not.toBe(palette.primary);
    expect(palette.primaryDark).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('generates muted version with alpha', () => {
    const palette = generatePalette('#2563eb');
    expect(palette.primaryMuted).toMatch(/^rgba\(/);
    expect(palette.primaryMuted).toContain('0.2');
  });

  it('returns white onPrimary for dark colors', () => {
    const palette = generatePalette('#1e3a5f');
    expect(palette.onPrimary).toBe('#ffffff');
  });

  it('returns dark onPrimary for light colors', () => {
    const palette = generatePalette('#fbbf24');
    expect(palette.onPrimary).toBe('#1a1a2e');
  });
});

describe('PRESET_COLORS', () => {
  it('has exactly 10 colors', () => {
    expect(PRESET_COLORS).toHaveLength(10);
  });

  it('each color has a name and valid hex', () => {
    for (const color of PRESET_COLORS) {
      expect(color).toHaveProperty('name');
      expect(color).toHaveProperty('hex');
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
