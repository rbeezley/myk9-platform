/**
 * MYK9-2093: Ringside names a check-in state with the shared word table, the
 * same one My Shows and "Your dogs today" read.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CHECK_IN_STATE_WORDS, checkInStateLabel } from '@myk9/ui';
import { CheckInIndicator } from './CheckInIndicator';

describe('CheckInIndicator words', () => {
  it.each(Object.keys(CHECK_IN_STATE_WORDS))('names %s with the shared word', state => {
    render(<CheckInIndicator status={state} />);
    expect(screen.getByTestId('check-in-indicator')).toHaveTextContent(
      checkInStateLabel(state) as string
    );
    expect(screen.getByTestId('check-in-indicator').textContent?.toLowerCase()).toBe(
      CHECK_IN_STATE_WORDS[state as keyof typeof CHECK_IN_STATE_WORDS]
    );
  });
});
