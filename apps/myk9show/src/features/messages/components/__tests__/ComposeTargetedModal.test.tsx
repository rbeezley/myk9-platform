import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ComposeTargetedModal } from '../ComposeTargetedModal';

const mockClasses = [
  { id: 'class-1', class_number: 1, class_name: 'Novice A', entry_count: 8 },
  { id: 'class-2', class_number: 2, class_name: 'Open B', entry_count: 12 },
];

describe('ComposeTargetedModal', () => {
  it('renders class selector when no classId is pre-selected', () => {
    render(
      <ComposeTargetedModal open={true} onClose={vi.fn()} onSend={vi.fn()} classes={mockClasses} />
    );
    const labels = screen.getAllByText(/select a class/i);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('pre-selects class when classId is provided', () => {
    render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        classes={mockClasses}
        preSelectedClassId="class-1"
      />
    );
    expect(screen.getByText(/Novice A/)).toBeInTheDocument();
    expect(screen.getByText(/8 exhibitors/i)).toBeInTheDocument();
  });

  it('calls onSend with classId and body', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={onSend}
        classes={mockClasses}
        preSelectedClassId="class-2"
      />
    );

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Class 2 is delayed 15 minutes');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('class-2', 'Class 2 is delayed 15 minutes');
  });

  it('disables send when no message is entered', () => {
    render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        classes={mockClasses}
        preSelectedClassId="class-1"
      />
    );
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
