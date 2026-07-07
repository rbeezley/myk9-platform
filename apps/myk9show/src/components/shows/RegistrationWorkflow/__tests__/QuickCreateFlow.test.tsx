import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit';
import { AddDogPanel } from '@/components/panels/edit';
import { QuickCreateFlow } from '../QuickCreateFlow';

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: vi.fn((props: AddDogPanelProps) =>
    props.open ? (
      <div data-testid="add-dog-panel" data-offline-first={String(props.offlineFirst)}>
        {props.userRole}
      </div>
    ) : null
  ),
}));

vi.mock('../CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: vi.fn(
    ({
      open,
      onExhibitorCreated,
      offlineFirst,
    }: {
      open: boolean;
      offlineFirst?: boolean;
      onExhibitorCreated: (
        exhibitor: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          roles: UserRole[];
          dogs: string[];
        },
        metadata?: { pendingMutationIds?: string[] }
      ) => void;
    }) =>
      open ? (
        <button
          type="button"
          data-offline-first={String(offlineFirst)}
          onClick={() =>
            onExhibitorCreated(
              {
                id: 'person-mailin-1',
                firstName: 'Molly',
                lastName: 'Mailbox',
                email: 'molly.mailbox@example.com',
                roles: ['exhibitor' as UserRole],
                dogs: [],
              },
              { pendingMutationIds: ['person-mutation-1'] }
            )
          }
        >
          Mock Create Exhibitor
        </button>
      ) : null
  ),
}));

describe('QuickCreateFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens AddDogPanel as secretary with the created exhibitor as owner', async () => {
    const user = userEvent.setup();

    render(<QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="single" />);

    fireEvent.click(screen.getByText('Mock Create Exhibitor'));
    await user.click(screen.getByRole('button', { name: 'Add First Dog' }));

    expect(screen.getByTestId('add-dog-panel')).toHaveTextContent(UserRole.SECRETARY);
    expect(AddDogPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        userRole: UserRole.SECRETARY,
        currentUserPersonId: 'person-mailin-1',
        offlineDependsOn: ['person-mutation-1'],
        variant: 'dialog',
      }),
      undefined
    );
  });

  it('passes offline-first mode through exhibitor and dog creation', async () => {
    const user = userEvent.setup();

    render(
      <QuickCreateFlow
        open
        onOpenChange={vi.fn()}
        onFlowCompleted={vi.fn()}
        mode="single"
        offlineFirst
      />
    );

    expect(screen.getByText('Mock Create Exhibitor')).toHaveAttribute('data-offline-first', 'true');

    fireEvent.click(screen.getByText('Mock Create Exhibitor'));
    await user.click(screen.getByRole('button', { name: 'Add First Dog' }));

    expect(AddDogPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offlineFirst: true,
        currentUserPersonId: 'person-mailin-1',
        offlineDependsOn: ['person-mutation-1'],
      }),
      undefined
    );
    expect(screen.getByTestId('add-dog-panel')).toHaveAttribute('data-offline-first', 'true');
  });
});
