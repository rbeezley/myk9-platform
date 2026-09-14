/**
 * MYK9-485 review round 2. The new-dog summary printed "Registered Name: Maple"
 * directly under a heading already reading Maple — noise on the one screen a
 * secretary reads specifically to catch mistakes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { QuickCreateFlow } from '../QuickCreateFlow';

const registration = {
  id: 'reg-1',
  organization: 'AKC',
  breed: 'Golden Retriever',
  registrationNumber: 'SW123',
  status: 'Active',
  isPrimary: true,
};

const MAPLE = {
  id: 'dog-maple',
  name: 'MAPLE',
  callName: 'MAPLE',
  gender: 'Female',
  dateOfBirth: '2021-09-30',
  age: 4,
  // Same name as the call name up to case and padding.
  registrations: [{ ...registration, registeredName: ' maple ' }],
};

const JUNI = {
  id: 'dog-juni',
  name: 'Juni',
  callName: 'Juni',
  gender: 'Female',
  dateOfBirth: '2022-05-20',
  age: 3,
  registrations: [{ ...registration, id: 'reg-2', registeredName: 'Juniper' }],
};

// The panel is mocked down to two buttons, each handing the flow one dog.
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: vi.fn((props: AddDogPanelProps) =>
    props.open ? (
      <div data-testid="add-dog-panel">
        <button type="button" onClick={() => props.onDogCreated?.(MAPLE as never)}>
          Mock Add Maple
        </button>
        <button type="button" onClick={() => props.onDogCreated?.(JUNI as never)}>
          Mock Add Juni
        </button>
      </div>
    ) : null
  ),
}));

vi.mock('../CreateExhibitorDialog', () => ({
  CreateExhibitorDialog: vi.fn(
    ({
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
              roles: ['exhibitor' as UserRole],
              dogs: [],
            })
          }
        >
          Mock Create Exhibitor
        </button>
      ) : null
  ),
}));

describe('QuickCreateFlow dog summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints the registered name only when it differs from the call name', async () => {
    const user = userEvent.setup();

    render(<QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="batch" />);

    fireEvent.click(screen.getByText('Mock Create Exhibitor'));
    await user.click(screen.getByRole('button', { name: 'Add First Dog' }));
    // The mocked panel renders outside the flow's dialog, which base-ui marks
    // `aria-hidden`/inert while open — so the mock buttons are unreachable by
    // role, exactly as for "Mock Create Exhibitor" above.
    fireEvent.click(screen.getByText('Mock Add Maple'));
    await user.click(screen.getByRole('button', { name: 'Add Another Dog' }));
    fireEvent.click(screen.getByText('Mock Add Juni'));
    await user.click(screen.getByRole('button', { name: 'Review' }));

    // The summary is on screen with both dogs, so the absence below is a real
    // absence and not an unrendered step.
    expect(screen.getByText('Dog Information (2)')).toBeInTheDocument();

    // Positive control: a genuinely different registered name is still printed.
    expect(screen.getByText('Registered Name: Juniper')).toBeInTheDocument();
    // ...and the repeat is gone, while the dog itself is still listed.
    expect(screen.getAllByText('MAPLE').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Registered Name: maple/i)).not.toBeInTheDocument();
  });
});
