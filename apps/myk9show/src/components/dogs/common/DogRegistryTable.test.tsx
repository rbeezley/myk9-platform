import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import source from './DogRegistryTable.tsx?raw';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig';
import { resolve } from 'node:path';
import { render, screen } from '@/test/utils/testUtils';
import { DogRegistryTable } from './DogRegistryTable';

const number = 'PAL123456789012345678901234567890';
const registry = {
  breed: null,
  breedVaries: true,
  rows: [
    { org: 'AKC', breed: 'Nova Scotia Duck Tolling Retriever', number },
    { org: 'UKC', breed: 'Mixed Breed', number: null },
  ],
};

let style: HTMLStyleElement;
beforeAll(async () => {
  const config = loadConfig(resolve('tailwind.config.js'));
  const { css } = await postcss([
    tailwindcss({
      ...config,
      content: [{ raw: source, extension: 'tsx' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
});
afterAll(() => style?.remove());

describe('DogRegistryTable readability', () => {
  it('renders identity labels, breeds and numbers at the 16px body floor', () => {
    render(<DogRegistryTable registry={registry} />);
    for (const text of ['AKC', registry.rows[0].breed, number]) {
      const size = getComputedStyle(screen.getByText(text)).fontSize;
      const pixels = parseFloat(size) * (size.endsWith('rem') ? 16 : 1);
      expect(pixels, text).toBeGreaterThanOrEqual(16);
    }
  });

  it('allows full differing breeds and long unbroken numbers to wrap', () => {
    render(<DogRegistryTable registry={registry} />);
    for (const text of [registry.rows[0].breed, number]) {
      const style = getComputedStyle(screen.getByText(text));
      expect(style.overflowWrap).toBe('anywhere');
      expect(style.textOverflow).not.toBe('ellipsis');
      expect(style.whiteSpace).not.toBe('nowrap');
    }
    expect(screen.getByText('Mixed Breed')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
  });

  it('omits repeated breeds when all registries agree', () => {
    render(<DogRegistryTable registry={{ ...registry, breedVaries: false }} />);
    expect(screen.queryByText('Mixed Breed')).not.toBeInTheDocument();
    expect(screen.getByText(number)).toBeVisible();
  });

  it('renders nothing for a dog without registrations', () => {
    const { container } = render(
      <DogRegistryTable registry={{ breed: null, breedVaries: false, rows: [] }} />
    );
    expect(container.querySelector('dl')).toBeNull();
  });
});
