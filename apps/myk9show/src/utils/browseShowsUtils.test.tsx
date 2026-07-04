import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getTypeBadge } from './browseShowsUtils';

describe('browse show type badges', () => {
  it('uses chip tokens for Rally instead of a fixed light-only hex chip', () => {
    render(<>{getTypeBadge('Rally')}</>);

    const badge = screen.getByText('RALLY');
    expect(badge.className).toContain('var(--chip-purple-bg)');
    expect(badge.className).toContain('var(--chip-purple-fg)');
    expect(badge.className).not.toContain('#5856D6');
  });
});
