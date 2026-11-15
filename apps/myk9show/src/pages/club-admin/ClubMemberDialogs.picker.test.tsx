/**
 * MYK9-1983: the Add Member and Assign Officer pickers list nobody until a search of two or
 * more characters is typed. Rendered output, so a picker that bypasses the shared helper
 * fails here, not just in the helper's unit test.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { AddMemberDialog, AssignOfficerDialog } from './ClubMemberDialogs';
import type { User } from '@/types/user-types';
import type { ClubMember } from '@/types/club-membership-types';

const PROMPT = 'Type a name or email to find someone.';

const people = [
  { id: 'p-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  { id: 'p-kj', firstName: 'Katherine', lastName: 'Johnson', email: 'kj@example.com' },
] as unknown as User[];

const adaMember: ClubMember = {
  id: 'm-ada',
  clubId: 'club-1',
  personId: 'p-ada',
  membershipType: 'full',
  membershipStatus: 'active',
  joinedDate: null,
  duesPaidThrough: null,
  votingEligible: true,
  notes: null,
};

const pickers = [
  {
    name: 'Add Member',
    renderPicker: () =>
      render(
        <AddMemberDialog
          open
          onClose={() => {}}
          onSave={() => {}}
          people={people}
          existingMemberIds={new Set()}
          isSaving={false}
        />
      ),
  },
  {
    name: 'Assign Officer',
    renderPicker: () =>
      render(
        <AssignOfficerDialog
          open
          onClose={() => {}}
          onSave={() => {}}
          members={[adaMember]}
          people={people}
          isSaving={false}
        />
      ),
  },
];

describe.each(pickers)('$name picker', ({ renderPicker }) => {
  it('opens with no names or emails, only the prompt', () => {
    renderPicker();

    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    for (const text of ['Ada Lovelace', 'ada@example.com', 'Katherine Johnson', 'kj@example.com']) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('still lists nobody after one character', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByLabelText('Person'), 'K');

    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(screen.queryByText('Katherine Johnson')).toBeNull();
  });

  it('shows matches from two characters', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByLabelText('Person'), 'Ka');

    expect(screen.getByText('Katherine Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
    expect(screen.queryByText(PROMPT)).toBeNull();
  });
});

describe('Assign Officer picker', () => {
  it('still marks club members once a search matches them', async () => {
    const user = userEvent.setup();
    pickers[1]!.renderPicker();

    await user.type(screen.getByLabelText('Person'), 'example');

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });
});
