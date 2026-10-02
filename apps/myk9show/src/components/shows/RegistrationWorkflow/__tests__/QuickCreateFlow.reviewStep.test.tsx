/**
 * MYK9-832 #6/#7. The review step's "Born: ... (Age: )" line went blank
 * because a newly-created dog never carries a precomputed `.age` field, and
 * its "will be added" copy claimed the exhibitor/dog would be created by
 * Complete Setup when both were already saved by the child dialogs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import type { AddDogPanelProps } from '@/components/panels/edit/AddDogPanel/types';
import { QuickCreateFlow } from '../QuickCreateFlow';

// A newly-created dog, exactly as AddDogPanel's onDogCreated hands it back:
// dateOfBirth is set, but `age` is never computed by the create path.
const NEWBORN_MAPLE = {
  id: 'dog-maple',
  name: 'MAPLE',
  callName: 'MAPLE',
  gender: 'Female',
  dateOfBirth: '2021-09-30',
  registrations: [],
};

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: vi.fn((props: AddDogPanelProps) =>
    props.open ? (
      <div data-testid="add-dog-panel">
        <button type="button" onClick={() => props.onDogCreated?.(NEWBORN_MAPLE as never)}>
          Mock Add Maple
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

async function reachReviewStep() {
  const user = userEvent.setup();
  render(<QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="single" />);
  fireEvent.click(screen.getByText('Mock Create Exhibitor'));
  await user.click(screen.getByRole('button', { name: 'Add First Dog' }));
  fireEvent.click(screen.getByText('Mock Add Maple'));
  return user;
}

describe('QuickCreateFlow review step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MYK9-832 #7: computes the age from date of birth instead of reading a never-populated field', async () => {
    await reachReviewStep();

    // A dog born 2021-09-30 should read its age, not a blank parenthetical —
    // the exact figure depends on "now", so assert the label is non-empty and
    // the old bug's literal blank is gone.
    expect(screen.getByText(/Born: 2021-09-30/)).toBeInTheDocument();
    expect(screen.queryByText(/\(Age: \)/)).not.toBeInTheDocument();
    expect(screen.getByText(/Born: 2021-09-30 \(\d+ yrs? old\)/)).toBeInTheDocument();
  });

  it('MYK9-832 #6: tells the secretary the person/dog are already saved, not that Complete Setup will add them', async () => {
    await reachReviewStep();

    expect(
      screen.getByText(/already been saved\. Complete Setup to use them for this registration\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/will be added to the system/)).not.toBeInTheDocument();
  });
});

describe('QuickCreateFlow wording', () => {
  // The record is a Person and the verb is "add"; "exhibitor" and "create" are gone from the
  // visible copy. The mock button stands in for the real dialog and keeps its own label.
  const visibleCopy = () => (document.body.textContent ?? '').replace('Mock Create Exhibitor', '');

  it('says Person and add on the first step and once the person is added', async () => {
    render(<QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={vi.fn()} mode="single" />);

    expect(screen.getByRole('heading', { name: 'Add Person' })).toBeInTheDocument();
    expect(visibleCopy()).not.toMatch(/exhibitor|\bcreat(e|ing)\b/i);

    fireEvent.click(screen.getByText('Mock Create Exhibitor'));
    // The flow moves on to the dogs step; Back returns to the person step, which confirms it.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Person Added')).toBeInTheDocument();
    expect(visibleCopy()).not.toMatch(/exhibitor|\bcreat(e|ing)\b/i);
  });

  it('says Person on the review step', async () => {
    await reachReviewStep();

    expect(screen.getByText('Person Information')).toBeInTheDocument();
    expect(visibleCopy()).not.toMatch(/exhibitor|\bcreat(e|ing)\b/i);
  });
});
