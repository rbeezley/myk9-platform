import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DensityControl } from './DensityControl';

describe('DensityControl', () => {
  it('marks the active density pressed and the other not', () => {
    render(<DensityControl density="comfortable" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /comfortable/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /compact/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('calls onChange with the clicked density', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DensityControl density="comfortable" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /compact/i }));

    expect(onChange).toHaveBeenCalledWith('compact');
  });
});
