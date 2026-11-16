import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import {
  AtShowClassListNoAssignmentsScreen,
  AtShowClassListScopeUnknownScreen,
} from './AtShowClassListScreens';

describe('class list dead-end screens', () => {
  it('offers the way back to the judge dashboard to an account that can open it', () => {
    const onBack = vi.fn();
    render(<AtShowClassListNoAssignmentsScreen readySlot={null} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Judge Dashboard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers no dashboard button when there is no way back (a passcode session)', () => {
    render(<AtShowClassListNoAssignmentsScreen readySlot={null} onBack={undefined} />);
    expect(
      screen.queryByRole('button', { name: 'Back to Judge Dashboard' })
    ).not.toBeInTheDocument();
  });

  it('keeps Try again but drops the dashboard button when there is no way back', () => {
    render(
      <AtShowClassListScopeUnknownScreen
        readySlot={null}
        isOnline
        onRetry={vi.fn()}
        onSeeEveryClass={vi.fn()}
        onBack={undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back to Judge Dashboard' })
    ).not.toBeInTheDocument();
  });
});
