/**
 * MYK9-1580: the wizard offers a person as a show judge only when they hold an active
 * qualification for the show's registry; anyone else is routed to the credentials form.
 */
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import type { User } from '@/types/user-types';
import { JudgesPicker } from '../JudgesPicker';

function judge(
  id: string,
  firstName: string,
  qualifications: Array<{ organization: string; judgeNumber: string }>
): User {
  return {
    id,
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@example.com`,
    judgeInfo: {
      judgeNumber: qualifications[0]?.judgeNumber ?? '',
      qualifications: qualifications.map(q => ({ ...q, status: 'Active' })),
    },
  } as unknown as User;
}

const akcOnly = judge('akc-only', 'Anthony', [{ organization: 'AKC', judgeNumber: 'A1' }]);
const ukcJudge = judge('ukc-judge', 'Zoe', [{ organization: 'UKC', judgeNumber: 'U9' }]);
const nobody = { id: 'nobody', firstName: 'Mia', lastName: 'Test', email: 'mia@example.com' };

function setup(over: Partial<React.ComponentProps<typeof JudgesPicker>> = {}) {
  const onAddJudge = vi.fn();
  const onSaveCredentials = vi.fn();
  render(
    <JudgesPicker
      selectedJudges={[]}
      people={[akcOnly, nobody as unknown as User, ukcJudge]}
      showOrganization="UKC"
      onAddJudge={onAddJudge}
      onRemoveJudge={vi.fn()}
      onSaveCredentials={onSaveCredentials}
      {...over}
    />
  );
  return { onAddJudge, onSaveCredentials };
}

describe('JudgesPicker on a UKC show', () => {
  it('lists the UKC-qualified judge before a judge qualified only for AKC', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /show judges/i }));

    const rows = Array.from(document.querySelectorAll('[data-judge-row="true"]')).map(
      row => row.textContent ?? ''
    );
    expect(rows[0]).toContain('Zoe');
    expect(rows.findIndex(r => r.includes('Anthony'))).toBeGreaterThan(0);
  });

  it('opens the UKC credentials form instead of adding an AKC-only judge', async () => {
    const user = userEvent.setup();
    const { onAddJudge } = setup();
    await user.click(screen.getByRole('button', { name: /show judges/i }));
    await user.click(screen.getByText(/Anthony Test/));

    expect(onAddJudge).not.toHaveBeenCalled();
    expect(screen.getByText(/Add Judge Credentials: Anthony Test/)).toBeInTheDocument();
    expect(screen.getByText('UKC')).toBeInTheDocument();
  });

  it('adds a UKC-qualified judge directly', async () => {
    const user = userEvent.setup();
    const { onAddJudge } = setup();
    await user.click(screen.getByRole('button', { name: /show judges/i }));
    await user.click(screen.getByText(/Zoe Test/));

    expect(onAddJudge).toHaveBeenCalledWith('ukc-judge');
  });

  it('saves a new judge with the show registry', async () => {
    const user = userEvent.setup();
    const onCreateJudge = vi.fn().mockResolvedValue('new-id');
    const { onAddJudge } = setup({ onCreateJudge });
    await user.click(screen.getByRole('button', { name: /show judges/i }));
    await user.click(screen.getByText(/Add new judge/));
    await user.type(screen.getByLabelText(/first name/i), 'Nia');
    await user.type(screen.getByLabelText(/last name/i), 'Park');
    await user.type(screen.getByLabelText(/judge number/i), '77');
    await user.type(screen.getByLabelText(/email/i), 'nia@example.com');
    await user.click(screen.getByRole('button', { name: /add|save/i }));

    expect(onCreateJudge).toHaveBeenCalledWith(expect.objectContaining({ organization: 'UKC' }));
    expect(onAddJudge).toHaveBeenCalledWith('new-id');
  });

  it('hints on a chip whose judge has no UKC credentials', () => {
    setup({ selectedJudges: [{ id: 'akc-only', name: 'Anthony Test', judgeNumber: '' }] });

    expect(screen.getByText('No UKC credentials')).toBeInTheDocument();
  });

  it('explains an empty list when the user cannot add credentials', async () => {
    const user = userEvent.setup();
    setup({ onSaveCredentials: undefined, people: [akcOnly] });
    await user.click(screen.getByRole('button', { name: /show judges/i }));

    expect(
      screen.getByText('No one has UKC credentials yet. A club admin can add them.')
    ).toBeInTheDocument();
  });
});
