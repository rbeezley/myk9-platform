import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import { StepJudge } from '../StepJudge';
import { StepSecretary } from '../StepSecretary';
import { getSecretaryAppointments } from '../../secretaryAppointments';
import { StepClubAdmin } from '../StepClubAdmin';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);

function scope(roleId: string, scopeType: ScopeType, scopeId: string): RoleScope {
  return { userId: 'person-1', roleId, scopeType, scopeId, createdAt: new Date(0) };
}

function setupScopes(scopes: RoleScope[]) {
  mockUseAuthContext.mockReturnValue(
    fromPartial({
      user: { id: 'auth-1' },
      userWithRoles: { id: 'auth-1', roles: [], permissions: [], scopes },
    })
  );
}

function makeRoleStepProps() {
  return {
    onNext: vi.fn(),
    onBack: vi.fn(),
    onNavigateAway: vi.fn(),
    canGoBack: true,
    nextLabel: 'Next',
  };
}

const initialClubs = useClubStore.getState().clubs;

beforeEach(() => {
  useClubStore.setState({
    clubs: [
      fromPartial<Club>({ id: 'club-a', name: 'Riverside Scent Club' }),
      fromPartial<Club>({ id: 'club-b', name: 'Hilltop Kennel Club' }),
    ],
  });
});

afterEach(() => {
  useClubStore.setState({ clubs: initialClubs });
});

describe('StepJudge', () => {
  it('saves only the changed numbers through set_my_judge_numbers, per registry', async () => {
    mockSupabase.from.mockReturnValueOnce(
      createChainableQuery({
        data: [
          { organization: 'AKC', judge_number: null },
          { organization: 'AKC', judge_number: null },
          { organization: 'UKC', judge_number: 'U-77' },
        ],
        error: null,
      })
    );
    mockSupabase.rpc.mockReturnValueOnce(createChainableQuery({ data: 3, error: null }));
    const props = makeRoleStepProps();

    render(<StepJudge personId="person-1" {...props} />);

    const akc = await screen.findByLabelText(/AKC/);
    expect(screen.getByLabelText(/UKC/)).toHaveValue('U-77');
    fireEvent.change(akc, { target: { value: ' A-123 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(props.onNext).toHaveBeenCalledOnce());
    expect(mockSupabase.from).toHaveBeenCalledWith('judge_qualifications');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('set_my_judge_numbers', {
      p_numbers: [{ organization: 'AKC', judge_number: 'A-123' }],
    });
  });

  it('shows the saved number after Next then Back, and does not save it again', async () => {
    // A refetch that never settles: what Back shows must come from the cache
    // the save wrote, not from a later round trip.
    const pending = new Proxy(
      {},
      { get: (_t, prop) => (prop === 'then' ? () => undefined : () => pending) }
    );
    mockSupabase.from
      .mockReturnValueOnce(
        createChainableQuery({
          data: [{ organization: 'AKC', judge_number: 'OLD-1' }],
          error: null,
        })
      )
      .mockReturnValue(pending);
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: 1, error: null }));

    function Harness() {
      const [onStep, setOnStep] = useState(true);
      return onStep ? (
        <StepJudge personId="person-1" {...makeRoleStepProps()} onNext={() => setOnStep(false)} />
      ) : (
        <button type="button" onClick={() => setOnStep(true)}>
          Back to judge step
        </button>
      );
    }

    render(<Harness />);

    fireEvent.change(await screen.findByLabelText(/AKC/), { target: { value: 'NEW-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to judge step' }));

    expect(screen.getByLabelText(/AKC/)).toHaveValue('NEW-2');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: 'Back to judge step' });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('continues without a save when nothing changed', async () => {
    mockSupabase.from.mockReturnValueOnce(
      createChainableQuery({ data: [{ organization: 'UKC', judge_number: 'U-77' }], error: null })
    );
    const props = makeRoleStepProps();

    render(<StepJudge personId="person-1" {...props} />);

    await screen.findByLabelText(/UKC/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(props.onNext).toHaveBeenCalledOnce();
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('set_my_judge_numbers', expect.anything());
  });

  it('stays on the step with a plain-English error when the save fails', async () => {
    mockSupabase.from.mockReturnValueOnce(
      createChainableQuery({ data: [{ organization: 'AKC', judge_number: null }], error: null })
    );
    mockSupabase.rpc.mockReturnValueOnce(
      createChainableQuery({ data: null, error: { message: 'P0002' } })
    );
    const props = makeRoleStepProps();

    render(<StepJudge personId="person-1" {...props} />);

    fireEvent.change(await screen.findByLabelText(/AKC/), { target: { value: 'A-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save your judge numbers. Please try again."
    );
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it('explains, without a form, when no registries are on file', async () => {
    mockSupabase.from.mockReturnValueOnce(createChainableQuery({ data: [], error: null }));

    render(<StepJudge personId="person-1" {...makeRoleStepProps()} />);

    expect(await screen.findByText(/no judging registries are on file/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('StepSecretary', () => {
  it('lists only the real club appointments, read-only, with no way to pick a club', () => {
    setupScopes([
      scope(UserRole.SECRETARY, ScopeType.CLUB, 'club-a'),
      scope(UserRole.CLUB_ADMIN, ScopeType.CLUB, 'club-b'),
    ]);

    render(<StepSecretary {...makeRoleStepProps()} />);

    const list = screen.getByRole('list', { name: 'Clubs you are secretary for' });
    expect(list).toHaveTextContent('Riverside Scent Club');
    expect(list).not.toHaveTextContent('Hilltop Kennel Club');
    // Access is granted only by a club admin's appointment: no picker, no form.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Back', 'Next']);
  });

  it('with no appointment, links to Request additional access and grants nothing itself', () => {
    setupScopes([]);
    const props = makeRoleStepProps();

    render(<StepSecretary {...props} />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/no club has appointed you yet/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Request additional access' });
    expect(link).toHaveAttribute('href', '/request-access');
    fireEvent.click(link);
    expect(props.onNavigateAway).toHaveBeenCalledWith('/request-access');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('counts show-level appointments separately from clubs', () => {
    expect(
      getSecretaryAppointments([
        scope(UserRole.SECRETARY, ScopeType.CLUB, 'club-a'),
        scope('trial_secretary', ScopeType.CLUB, 'club-a'),
        scope(UserRole.SECRETARY, ScopeType.SHOW, 'show-1'),
        scope(UserRole.JUDGE, ScopeType.SHOW, 'show-2'),
      ])
    ).toEqual({ clubIds: ['club-a'], showCount: 1 });
  });
});

describe('StepClubAdmin', () => {
  it('links to the existing club profile and members pages instead of editing here', () => {
    setupScopes([scope(UserRole.CLUB_ADMIN, ScopeType.CLUB, 'club-b')]);
    const props = makeRoleStepProps();

    render(<StepClubAdmin {...props} />);

    expect(screen.getByRole('list', { name: 'Clubs you manage' })).toHaveTextContent(
      'Hilltop Kennel Club'
    );
    expect(screen.getByRole('link', { name: 'Club profile' })).toHaveAttribute(
      'href',
      '/clubs/club-b'
    );
    fireEvent.click(screen.getByRole('link', { name: 'Members and officers' }));
    expect(props.onNavigateAway).toHaveBeenCalledWith('/club-admin/members');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
