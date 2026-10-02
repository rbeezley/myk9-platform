/**
 * MYK9-931 (H4): an error on a hidden tab used to look like "Save does nothing".
 * Every tabbed panel (Show, Trial, Class, Dog; Person and Club are covered in
 * their own files) now switches to the tab holding the first invalid field on a
 * failed Save and focuses that field.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { TrialEditPanel } from '../TrialEditPanel';
import { ClassEditPanel } from '../ClassEditPanel';
import { DogEditPanel } from '../DogEditPanel';
import type { Trial } from '@/components/trials/types/trial.types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [], loadUsers: vi.fn() }),
}));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const selected = () =>
  screen
    .queryAllByRole('tab', { selected: true })
    .map(t => t.textContent ?? '')
    .join(' ');

describe('failed Save on a hidden tab', () => {
  it('Show: switches to Fees and focuses the invalid junior handler fee', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <ShowEditPanel
        open
        onClose={vi.fn()}
        showId="show-1"
        showName="Heartland"
        onSave={onSave}
        initialShowData={{
          id: 'show-1',
          name: 'Heartland',
          organization: 'AKC',
          clubId: 'club-1',
          startDate: '2026-11-01',
          endDate: '2026-11-02',
          juniorHandlerFee: 'abc',
        }}
      />
    );
    await user.type(await screen.findByLabelText(/Show Name/), ' 2');
    expect(selected()).toMatch(/Basic Info/);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(selected()).toMatch(/Fees/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'juniorHandlerFee'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Trial: switches to Scheduling and focuses the blank trial date', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <TrialEditPanel
        open
        onClose={vi.fn()}
        trialId="trial-1"
        trialName="Saturday AM"
        onSave={onSave}
        initialTrialData={{
          name: 'Saturday AM',
          trialDate: '',
          trialNumber: '1',
          status: 'Upcoming' as Trial['status'],
          plannedStartTime: '09:00 AM',
          eventNumber: '1',
          order: '1',
        }}
      />
    );
    await user.type(await screen.findByLabelText(/Trial Name/), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(selected()).toMatch(/Scheduling/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'trialDate'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Class: switches to Requirements and focuses the invalid pre-entry fee', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <ClassEditPanel
        open
        onClose={vi.fn()}
        classId="cls-1"
        className="Container Novice"
        onSave={onSave}
        initialClassData={{
          id: 'cls-1',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          classOrder: '1',
          status: 'Scheduled',
          estimatedJudgingTime: '',
          preEntryFee: -5,
        }}
      />
    );
    await user.type(await screen.findByLabelText('Class Order'), '2');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(selected()).toMatch(/Requirements/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'preEntryFee'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Dog: leaves the More tab for Basic Info and focuses the blank call name', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <DogEditPanel
        open
        onClose={vi.fn()}
        dogId="dog-1"
        dogName="Rex"
        onSave={onSave}
        initialDogData={{
          callName: 'Rex',
          gender: 'Male',
          dateOfBirth: '2020-01-01',
        }}
      />
    );
    const callName = await screen.findByLabelText(/Call Name/i);
    await user.clear(callName);
    await user.click(screen.getByRole('tab', { name: /More for this dog/ }));
    expect(selected()).toMatch(/More for this dog/);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(selected()).toMatch(/Basic Info/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'callName'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
