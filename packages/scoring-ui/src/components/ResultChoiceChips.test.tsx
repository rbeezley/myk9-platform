import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResultChoiceChips } from './ResultChoiceChips';

describe('ResultChoiceChips fault counter (MYK9-2004)', () => {
  it('counts past the UKC limit and says why instead of capping', () => {
    const onFaultCountChange = vi.fn();
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={1}
        onFaultCountChange={onFaultCountChange}
        sportType="UKC_NOSEWORK"
        level="Level 1"
      />
    );
    const add = screen.getByLabelText('Add a fault');
    expect(add).not.toBeDisabled();
    fireEvent.click(add);
    expect(onFaultCountChange).toHaveBeenCalledWith(2);
  });

  it('shows the limit sentence when over the limit', () => {
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={2}
        onFaultCountChange={vi.fn()}
        sportType="UKC_NOSEWORK"
        level="Level 1"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 faults is over the UKC limit of 1. Remove a fault, or choose NQ.'
    );
  });

  it('shows no sentence at or under the limit', () => {
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={1}
        onFaultCountChange={vi.fn()}
        sportType="UKC_NOSEWORK"
        level="Level 1"
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
