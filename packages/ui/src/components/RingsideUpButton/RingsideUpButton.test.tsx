import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RingsideUpButton } from './RingsideUpButton';

describe('RingsideUpButton', () => {
  it('shows the parent name beside the arrow and calls onClick', () => {
    const onClick = vi.fn();
    render(<RingsideUpButton label="Classes" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Classes' });
    expect(button.textContent).toBe('Classes');
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a 44px minimum target', () => {
    render(<RingsideUpButton label="Show" onClick={() => {}} />);
    const { className } = screen.getByRole('button', { name: 'Show' });
    expect(className).toContain('min-h-11');
    expect(className).toContain('min-w-11');
  });
});
