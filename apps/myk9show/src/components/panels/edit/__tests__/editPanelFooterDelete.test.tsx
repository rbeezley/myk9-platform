/**
 * CRUD standard Phase 3: every Edit panel puts "Delete ‹object›" at the far
 * left of its footer in edit mode, never in create mode, and nowhere when the
 * caller offers no delete (a viewer the server would refuse).
 *
 * Rendered on the real panels. The shared dialog is a stand-in here (its own
 * suite covers it); this file proves each panel hands the wrapper the option.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Trial } from '@/components/trials/types/trial.types';
import type { EditPanelDeleteOption } from '../EditPanelDelete';
import { ClubEditPanel } from '../ClubEditPanel';
import { TrialEditPanel } from '../TrialEditPanel';
import { ClassEditPanel } from '../ClassEditPanel';
import { DogEditPanel } from '../DogEditPanel';
import { UserEditPanel } from '../UserEditPanel';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/shows/WithdrawalPolicyCard', () => ({ WithdrawalPolicyCard: () => null }));
vi.mock('@/features/delete/DeleteObjectDialog', () => ({
  DeleteObjectDialog: ({ kind, targets }: { kind: string; targets: { name: string }[] }) => (
    <div role="dialog" aria-label="Delete confirmation">
      {kind}:{targets[0]?.name}
    </div>
  ),
}));

const option = (kind: EditPanelDeleteOption['kind'], name: string): EditPanelDeleteOption => ({
  kind,
  objectLabel: kind,
  targets: [{ id: `${kind}-1`, name }],
});

const trialData = {
  name: 'Saturday AM',
  showId: 'show-1',
  showName: 'Heartland',
  trialDate: '2026-05-02',
  trialNumber: '1',
  status: 'Upcoming' as Trial['status'],
  plannedStartTime: '09:00 AM',
  eventNumber: '1',
  order: '1',
};

interface Surface {
  kind: EditPanelDeleteOption['kind'];
  name: string;
  /** Renders the panel in EDIT mode with the given option. */
  edit: (onDelete: EditPanelDeleteOption | undefined) => React.ReactElement;
}

const surfaces: Surface[] = [
  {
    kind: 'club',
    name: 'Heartland KC',
    edit: onDelete => (
      <ClubEditPanel
        open
        onClose={vi.fn()}
        clubId="club-1"
        clubName="Heartland KC"
        initialClubData={{ id: 'club-1', name: 'Heartland KC' }}
        onDelete={onDelete}
      />
    ),
  },
  {
    kind: 'trial',
    name: 'Saturday AM',
    edit: onDelete => (
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="trial-1"
        trialName="Saturday AM"
        initialTrialData={trialData}
        onDelete={onDelete}
      />
    ),
  },
  {
    kind: 'class',
    name: 'Interior Novice A',
    edit: onDelete => (
      <ClassEditPanel
        open
        onClose={vi.fn()}
        classId="class-1"
        className="Interior Novice A"
        initialClassData={{ element: 'Interior', level: 'Novice' }}
        onDelete={onDelete}
      />
    ),
  },
  {
    kind: 'dog',
    name: 'Rex',
    edit: onDelete => (
      <DogEditPanel
        open
        onClose={vi.fn()}
        dogId="dog-1"
        dogName="Rex"
        initialDogData={{ callName: 'Rex' }}
        onDelete={onDelete}
      />
    ),
  },
  {
    kind: 'person',
    name: 'Jane Smith',
    edit: onDelete => (
      <UserEditPanel
        open
        onClose={vi.fn()}
        userId="person-1"
        userName="Jane Smith"
        initialUserData={{ firstName: 'Jane', lastName: 'Smith' }}
        onDelete={onDelete}
      />
    ),
  },
];

describe.each(surfaces)('$kind edit panel footer', ({ kind, name, edit }) => {
  it(`puts Delete ${kind} first in the footer row and opens the shared dialog`, async () => {
    const { user } = render(edit(option(kind, name)));

    const row = screen.getByTestId('edit-panel-action-row');
    const button = screen.getByRole('button', { name: `Delete ${kind}` });
    expect(row.firstElementChild).toBe(button);

    await user.click(button);
    expect(screen.getByRole('dialog', { name: 'Delete confirmation' })).toHaveTextContent(
      `${kind}:${name}`
    );
  });

  it('shows no Delete when the caller offers none', () => {
    render(edit(undefined));
    // Positive control: the footer rendered, so the absence is the option's.
    expect(screen.getByTestId('edit-panel-action-row')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });
});

describe('create mode', () => {
  it('offers no Delete when adding a club, even if an option is passed', () => {
    render(
      <ClubEditPanel
        open
        onClose={vi.fn()}
        clubId=""
        clubName=""
        initialClubData={{}}
        mode="create"
        onDelete={option('club', 'x')}
      />
    );
    expect(screen.getByRole('button', { name: /^Next: Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('offers no Delete when adding a person, even if an option is passed', () => {
    render(
      <UserEditPanel
        open
        onClose={vi.fn()}
        userId=""
        userName=""
        initialUserData={{}}
        onDelete={option('person', 'x')}
      />
    );
    expect(screen.getByRole('button', { name: /^Next: Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });
});
