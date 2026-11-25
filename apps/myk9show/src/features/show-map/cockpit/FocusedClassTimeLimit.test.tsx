import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { FocusedClassTimeLimit } from './FocusedClassTimeLimit';

const live = vi.hoisted(() => vi.fn());
vi.mock('@/features/at-show/useLiveClasses', () => ({ useLiveClasses: live }));
const range = vi.hoisted(() => vi.fn());
vi.mock('@/features/at-show/slots/maxTimeRule', () => ({ useMaxTimeRange: range }));
// The existing Max Time dialog (Ringside's) is covered in MaxTimeDialog.test; here, that it opens.
const dialog = vi.hoisted(() => vi.fn());
vi.mock('@/features/at-show/slots/classDialogs', () => ({
  MaxTimeDialog: (props: { isOpen: boolean; classData: { id: string } }) => {
    dialog(props);
    return props.isOpen ? <div role="dialog" aria-label="Max Time" /> : null;
  },
}));

const exterior = {
  id: 'class-1',
  name: 'Exterior Excellent',
  element: 'Exterior',
  level: 'Excellent',
  areaCount: 1,
  timeLimitSeconds: 180,
};

describe('FocusedClassTimeLimit (MYK9-2379)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.mockReturnValue([exterior]);
    range.mockReturnValue({ low: 120, high: 300, judgeSet: true });
  });

  it('shows the class time limit, and Change opens the existing Max Time dialog for the class', async () => {
    const { user } = render(<FocusedClassTimeLimit classId="class-1" registryId="AKC" />);
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Max Time' })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Change time limit of Exterior Excellent' })
    );

    expect(screen.getByRole('dialog', { name: 'Max Time' })).toBeInTheDocument();
    expect(dialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isOpen: true,
        classData: expect.objectContaining({
          id: 'class-1',
          class_name: 'Exterior Excellent',
          time_limit_seconds: 180,
        }),
      })
    );
  });

  it('shows a time the rulebook fixes with no Change button', () => {
    live.mockReturnValue([{ ...exterior, timeLimitSeconds: undefined }]);
    range.mockReturnValue({ low: 120, high: 120, fixed: 120, judgeSet: false });
    render(<FocusedClassTimeLimit classId="class-1" registryId="AKC" />);

    expect(screen.queryByRole('button', { name: /Change time limit/ })).not.toBeInTheDocument();
  });

  it('offers no Change before the class has loaded', () => {
    live.mockReturnValue(null);
    range.mockReturnValue(null);
    render(<FocusedClassTimeLimit classId="class-1" registryId="AKC" />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change time limit/ })).not.toBeInTheDocument();
  });
});
