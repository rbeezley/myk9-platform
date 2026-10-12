import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { AddDogPanel } from '@/components/panels/edit';
import { QuickCreateFlow } from '../QuickCreateFlow';
import {
  quickCreateProgress,
  quickCreateStepLabel,
  quickCreateTitle,
} from '../QuickCreateFlow.helpers';

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

  // MYK9-1081: one slide-out whose title follows the view and whose subtitle
  // says where the secretary is in the three steps (replaces the MYK9-832 #4
  // shell-hiding helper: there is no second surface to hide any more).
  describe('panel copy helpers', () => {
    it.each([
      ['steps', 'dog', 'Quick Registration Setup'],
      ['person-form', 'dog', 'Add Person'],
      ['dog-form', 'dog', 'Add Dog'],
      ['dog-form', 'registration-add', 'Add New Registration'],
      ['dog-form', 'registration-edit', 'Edit Registration'],
    ] as const)('titles the %s view (%s) "%s"', (view, subMode, title) => {
      expect(quickCreateTitle(view, subMode)).toBe(title);
    });

    it.each([
      ['exhibitor', 'Step 1 of 3: Add Person', 25],
      ['dogs', 'Step 2 of 3: Add Dog(s)', 65],
      ['review', 'Step 3 of 3: Review & Complete', 90],
    ] as const)('labels the %s step "%s" at %i%%', (step, label, progress) => {
      expect(quickCreateStepLabel(step)).toBe(label);
      expect(quickCreateProgress(step)).toBe(progress);
    });
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
        variant: 'inline',
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
