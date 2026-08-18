import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'ClassDetailsPopoverSlot.tsx'), 'utf8');

describe('ClassDetailsPopoverSlot touch targets', () => {
  it('keeps the close button at the 44px ringside touch floor', () => {
    expect(source).toContain('aria-label="Close"');
    expect(source).toContain('min-h-11 min-w-11');
    expect(source).not.toContain('h-6 w-6');
  });

  it('renders class state through the shared status grammar', () => {
    expect(source).toContain("from '@/components/status'");
    expect(source).toContain('<StatusBadge family="class"');
    expect(source).not.toMatch(/getClassStatusLabel|getClassStatusTier/);
  });

  it('keeps raw class ids out of the default class-details workflow', () => {
    expect(source).not.toContain('label="Class ID"');
  });
});
