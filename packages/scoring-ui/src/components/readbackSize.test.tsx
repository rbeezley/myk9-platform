import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoreConfirmationDialog, timeRows } from './ScoreConfirmationDialog';
import { FaultStepper } from './FaultStepper';

// MYK9-1724: the steward turns the phone round to show the judge the read-back, so
// times and faults are large; the faults row on the sheet is one centered group.
// (Rendered sizes at 375 x 667 are measured in a real browser, see the PR.)

describe('Score Confirmation read-back is readable at arm’s length', () => {
  function renderDialog() {
    render(
      <ScoreConfirmationDialog
        subtitle="Interior Novice"
        armband={7}
        dogName="Rex"
        handlerName="Jane Smith"
        result="NQ"
        rows={[
          ...timeRows(
            [
              { areaName: 'Area 1', time: '01:12.34' },
              { areaName: 'Area 2', time: '00:58.10' },
            ],
            '02:10.44'
          ),
          { label: 'Faults', value: 3, className: 'text-red-500' },
        ]}
        reason="Dog left the search area"
        isSubmitting={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
  }

  it.each(['01:12.34', '00:58.10', '02:10.44', '3'])('shows %s at 24px', value => {
    renderDialog();
    expect(screen.getByText(value)).toHaveClass('text-2xl');
  });

  it('keeps the reason at prose size', () => {
    renderDialog();
    const reason = screen.getByText('Dog left the search area');
    expect(reason).toHaveClass('text-base');
    expect(reason).not.toHaveClass('text-2xl');
  });

  it('enlarges each row label too', () => {
    renderDialog();
    expect(screen.getByText('Total time')).toHaveClass('text-lg');
    expect(screen.getByText('Faults')).toHaveClass('text-lg');
  });
});

describe('Faults row', () => {
  it('centers the label and the steppers as one group', () => {
    render(<FaultStepper value={0} onChange={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Add a fault' }).parentElement?.parentElement;
    expect(row).toHaveClass('justify-center');
    expect(row).not.toHaveClass('justify-between');
  });
});
