import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { OperatorAlertDetail } from './OperatorAlertDetail';

describe('OperatorAlertDetail', () => {
  it('keeps the technical-details control at the 44px minimum', () => {
    render(<OperatorAlertDetail detail={{ message: 'Summary', diagnostics: 'x'.repeat(121) }} />);

    const control = screen.getByRole('button', { name: 'Technical details' });
    expect(control).toHaveClass('min-h-11');
    expect(control).not.toHaveClass('min-h-10');
  });
});
