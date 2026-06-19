import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit';
import { AddDogPanel } from '@/components/panels/edit';
import { QuickCreateFlow } from '../QuickCreateFlow';

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: vi.fn((props: AddDogPanelProps) =>
    props.open ? <div data-testid="add-dog-panel">{props.userRole}</div> : null
  ),
}));

vi.mock('../CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: ({
    open,
    onExhibitorCreated,
  }: {
    open: boolean;
    onExhibitorCreated: (exhibitor: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      roles: UserRole[];
      dogs: string[];
    }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onExhibitorCreated({
            id: 'person-mailin-1',
            firstName: 'Molly',
            lastName: 'Mailbox',
            email: 'molly.mailbox@example.com',
            roles: [UserRole.EXHIBITOR],
            dogs: [],
          })
        }
      >
        Mock Create Exhibitor
      </button>
    ) : null,
}));

describe('QuickCreateFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens AddDogPanel as secretary with the created exhibitor as owner', async () => {
    const user = userEvent.setup();

    render(
      <QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="single" />
    );

    fireEvent.click(screen.getByText('Mock Create Exhibitor'));
    await user.click(screen.getByRole('button', { name: 'Add First Dog' }));

    expect(screen.getByTestId('add-dog-panel')).toHaveTextContent(UserRole.SECRETARY);
    expect(AddDogPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        userRole: UserRole.SECRETARY,
        currentUserPersonId: 'person-mailin-1',
        variant: 'dialog',
      }),
      undefined
    );
  });
});
