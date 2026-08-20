import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';
import { ArmbandBadge } from './ArmbandBadge';

/** Every .tsx under src, so a new consumer is covered the day it is written. */
const allTsx = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') allTsx(p, acc);
    } else if (name.endsWith('.tsx') && !name.includes('.test.')) {
      acc.push(p);
    }
  }
  return acc;
};

describe('ArmbandBadge', () => {
  it('renders assigned armbands', () => {
    render(<ArmbandBadge armband="142" />);

    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('renders unassigned armbands as an em dash', () => {
    const { rerender } = render(<ArmbandBadge armband={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<ArmbandBadge armband={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<ArmbandBadge armband="-" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // A four-digit armband is routine at a large show. The badge used to be a
  // fixed square (`size-9`, shrunk to `size-8` and `size-6` by callers) with no
  // horizontal padding, so "2009" rendered edge to edge and its first and last
  // digits were cut off by the corner radius — measured on the live page at
  // 1280px, where "100" got 3px/2px of side padding and "2009" got 0px/0px.
  // The height stays fixed; only the width is allowed to grow.
  it('grows with a wide armband instead of clipping it', () => {
    render(<ArmbandBadge armband="2009" />);
    const badge = screen.getByText('2009');

    expect(badge.className).toMatch(/\bmin-w-/);
    expect(badge.className).toMatch(/\bpx-/);
    // `size-*` and `w-*` both pin the width, which is what caused the clipping.
    expect(badge.className).not.toMatch(/(?:^|\s)size-\d/);
    expect(badge.className).not.toMatch(/(?:^|\s)w-\d/);
  });

  it('is never pinned to a fixed square by a consumer', () => {
    const offenders: string[] = [];
    for (const file of allTsx(resolve(__dirname, '../..'))) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('<ArmbandBadge')) continue;
      for (const usage of src.matchAll(/<ArmbandBadge[\s\S]*?\/>/g)) {
        const text = usage[0];
        const bad = text.match(/(?:^|["\s])(?:size|w)-(?:\d+|\[[^\]]+\])/g);
        if (bad) offenders.push(`${file.split('/src/')[1]}: ${bad.join(' ')}`);
      }
    }
    // Height-only classes (`h-8 min-w-8`) are the supported way to resize.
    expect(offenders).toEqual([]);
  });
});
