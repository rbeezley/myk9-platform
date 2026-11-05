import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { Switch } from './switch';

// MYK9-1716: the Off track must not use --input (identical to --card in both
// themes). Real contrast is measured in the browser; this pins the class that
// carries it and that the On state and disabled look are untouched.
describe('Switch', () => {
  it('renders the Off track with a visible fill, not the card-coloured input token', () => {
    render(<Switch checked={false} aria-label="Off switch" />);
    const root = screen.getByRole('switch', { name: 'Off switch' });
    expect(root.className).toContain('data-[unchecked]:bg-muted-foreground');
    expect(root.className).not.toContain('data-[unchecked]:bg-input');
  });

  it('keeps the On track primary and the disabled dimming', () => {
    render(<Switch checked disabled aria-label="On switch" />);
    const root = screen.getByRole('switch', { name: 'On switch' });
    expect(root.className).toContain('data-[checked]:bg-primary');
    expect(root.className).toContain('disabled:opacity-50');
    expect(root).toHaveAttribute('aria-checked', 'true');
  });
});
