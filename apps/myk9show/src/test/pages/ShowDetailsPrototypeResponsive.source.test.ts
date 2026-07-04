import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve(__dirname, '../../pages/ShowDetailsPrototype.tsx');

describe('ShowDetailsPrototype responsive source guard', () => {
  it('keeps the public landing copy-link action full-width and touch-sized on mobile', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('flex flex-col gap-4 p-4 sm:flex-row sm:items-center');
    expect(source).toContain('min-h-[44px] w-full shrink-0 sm:w-auto');
  });
});
