import type { ReactElement } from 'react';
import { describe, it, expect } from 'vitest';
import { PRESET_ICONS } from '../ResultsControlPage/resultsControlUtils';

const iconClass = (preset: keyof typeof PRESET_ICONS): string =>
  (PRESET_ICONS[preset] as ReactElement<{ className?: string }>).props.className ?? '';

describe('PRESET_ICONS — semantic status tokens, not raw palette', () => {
  // Regression guard: preset icons must use semantic tokens (which carry dark
  // values) so they read correctly in dark mode and stay inside the status
  // vocabulary — never raw Tailwind palette colors (text-green/blue/orange-500).
  it('maps each preset to its semantic status token', () => {
    expect(iconClass('open')).toContain('text-success');
    expect(iconClass('standard')).toContain('text-info');
    expect(iconClass('review')).toContain('text-warning');
  });

  it('uses no raw Tailwind palette color on any preset icon', () => {
    const rawPalette = /text-(green|blue|orange|red|amber|teal|slate|gray)-\d{2,3}/;
    for (const preset of Object.keys(PRESET_ICONS) as (keyof typeof PRESET_ICONS)[]) {
      expect(iconClass(preset)).not.toMatch(rawPalette);
    }
  });
});
