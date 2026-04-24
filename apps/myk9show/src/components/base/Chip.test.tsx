import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders children and defaults to stone color', () => {
    render(<Chip>Scratched</Chip>);
    const el = screen.getByText('Scratched');
    expect(el.style.background).toBe('var(--chip-stone-bg)');
    expect(el.style.color).toBe('var(--chip-stone-fg)');
  });

  it.each(['green', 'amber', 'red', 'blue', 'purple', 'teal', 'stone'] as const)(
    'wires %s color to the matching --chip-*-bg/fg tokens',
    color => {
      render(
        <Chip color={color} data-testid={`chip-${color}`}>
          label
        </Chip>
      );
      const el = screen.getByTestId(`chip-${color}`);
      expect(el.style.background).toBe(`var(--chip-${color}-bg)`);
      expect(el.style.color).toBe(`var(--chip-${color}-fg)`);
    }
  );

  it('renders leading and trailing icons', () => {
    render(
      <Chip
        color="green"
        leadingIcon={<span data-testid="lead">L</span>}
        trailingIcon={<span data-testid="trail">T</span>}
      >
        Q
      </Chip>
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('applies sm size classes when size="sm"', () => {
    render(
      <Chip size="sm" data-testid="chip-sm">
        x
      </Chip>
    );
    expect(screen.getByTestId('chip-sm').className).toContain('text-xs');
  });

  it('merges custom className and inline style with color tokens', () => {
    render(
      <Chip
        color="amber"
        className="uppercase"
        style={{ letterSpacing: '0.1em' }}
        data-testid="chip-custom"
      >
        live
      </Chip>
    );
    const el = screen.getByTestId('chip-custom');
    expect(el.className).toContain('uppercase');
    expect(el.style.letterSpacing).toBe('0.1em');
    // Non-color styles merge without clobbering the color tokens
    expect(el.style.background).toBe('var(--chip-amber-bg)');
  });
});
