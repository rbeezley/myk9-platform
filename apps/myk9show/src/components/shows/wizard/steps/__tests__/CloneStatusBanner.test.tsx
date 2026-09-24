/**
 * MYK9-604 — the clone status (loading / failed / applied) and every recovery action live in
 * CloneStatusBanner, which reads the wizard store and never depends on the show-list query.
 * A clone that is loading locks the form, so its Cancel must survive the list query erroring
 * or emptying; otherwise the secretary is stuck. Every recovery action meets the 44px floor
 * (docs/INTENT.md, "Large touch targets").
 *
 * Uses the REAL wizard store so "the draft is preserved" and "the wizard is usable
 * afterwards" are observed on the state the wizard actually reads.
 */
import { act, render, screen, waitFor, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useWizardStore } from '@/store/wizardStore';

const mockGetClassesByTrialId = vi.hoisted(() => vi.fn());
const queryState = vi.hoisted(() => ({
  current: { data: [] as unknown[], isLoading: false, isError: false },
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: vi.fn(() => queryState.current),
}));
vi.mock('@/services/database/classes', () => ({ getClassesByTrialId: mockGetClassesByTrialId }));
vi.mock('@/store/userStore', () => ({ useUserStore: vi.fn(() => ({ people: [] })) }));
vi.mock('@/hooks/useUserClubIds', () => ({ useUserClubIds: vi.fn(() => null) }));
vi.mock('@/hooks/useTemplates', () => ({ useTemplates: vi.fn(() => ({ templates: [] })) }));

import { CloneFromShowCombobox } from '../CloneFromShowCombobox';
import { CloneStatusBanner } from '../CloneStatusBanner';

// A source show whose classes are not in the list read, so cloning must load them.
const sourceShow = {
  id: 'show-1',
  name: 'Heartland Spring Trial',
  organization: 'UKC',
  location: 'Tulsa',
  clubId: 'club-1',
  preEntryFee: '28',
  dayOfShowFee: '35',
  assignedJudges: [],
  trials: [{ id: 'trial-1', name: 'Friday Trial 1', date: '', status: '', trialType: 'Nosework' }],
} as unknown as Show;

type ClassesResult = { data: Array<Record<string, unknown>>; error: Error | null };

function deferredClasses() {
  let resolve: (value: ClassesResult) => void = () => {};
  const promise = new Promise<ClassesResult>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function CloneUi() {
  return (
    <>
      <CloneFromShowCombobox />
      <CloneStatusBanner />
    </>
  );
}

async function pickSourceShow() {
  const user = userEvent.setup();
  const rendered = render(<CloneUi />);
  await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
  await user.click(screen.getByText('Heartland Spring Trial'));
  return { ...rendered, user };
}

function expectTouchTarget(button: HTMLElement) {
  // Button size "touch" is the 44px floor (min-h-11), 48px from the sm breakpoint.
  expect(button.className).toMatch(/(^|\s)min-h-11(\s|$)/);
  expect(button.className).not.toMatch(/(^|\s)h-8(\s|$)/);
}

const draftName = () => useWizardStore.getState().show.name;
const cloneStatus = () => useWizardStore.getState().cloneHydration.status;

describe('CloneStatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWizardStore.getState().resetWizard();
    useWizardStore.getState().updateShowData({ name: 'Existing draft' });
    queryState.current = { data: [sourceShow], isLoading: false, isError: false };
  });

  it.each([
    ['errors', { data: [], isLoading: false, isError: true }],
    ['goes empty', { data: [], isLoading: false, isError: false }],
  ])(
    'keeps Cancel clone working when the show-list query %s mid-load, and the wizard is usable after',
    async (_label, lostQuery) => {
      const pending = deferredClasses();
      mockGetClassesByTrialId.mockReturnValueOnce(pending.promise);
      const { user, rerender } = await pickSourceShow();
      expect(cloneStatus()).toBe('hydrating');

      queryState.current = lostQuery;
      rerender(<CloneUi />);

      const cancel = screen.getByRole('button', { name: /cancel clone/i });
      expectTouchTarget(cancel);
      await user.click(cancel);

      expect(cloneStatus()).toBe('idle');
      expect(draftName()).toBe('Existing draft');
      // The late snapshot must not land after the cancel.
      await act(async () => pending.resolve({ data: [], error: null }));
      expect(draftName()).toBe('Existing draft');
      // Navigation is no longer locked by the clone.
      useWizardStore.getState().setCurrentStep(1);
      expect(useWizardStore.getState().currentStep).toBe(1);
    }
  );

  it('on failure, Retry reloads the same show and keeps the draft until it applies', async () => {
    mockGetClassesByTrialId.mockResolvedValueOnce({ data: [], error: new Error('offline') });
    const { user } = await pickSourceShow();
    await waitFor(() => expect(cloneStatus()).toBe('failed'));

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load the cloned classes/i);
    expect(draftName()).toBe('Existing draft');

    const pending = deferredClasses();
    mockGetClassesByTrialId.mockReturnValueOnce(pending.promise);
    const retry = screen.getByRole('button', { name: /retry clone/i });
    expectTouchTarget(retry);
    await user.click(retry);

    expect(cloneStatus()).toBe('hydrating');
    expect(draftName()).toBe('Existing draft');
    await act(async () => pending.resolve({ data: [], error: null }));
    await waitFor(() => expect(cloneStatus()).toBe('ready'));
    expect(draftName()).toBe('Heartland Spring Trial');
  });

  it('on failure, Choose another show returns to the picker and keeps the draft', async () => {
    mockGetClassesByTrialId.mockResolvedValueOnce({ data: [], error: new Error('offline') });
    const { user } = await pickSourceShow();
    await waitFor(() => expect(cloneStatus()).toBe('failed'));

    const chooseAnother = screen.getByRole('button', { name: /choose another show/i });
    expectTouchTarget(chooseAnother);
    expect(screen.queryByRole('button', { name: /start fresh/i })).not.toBeInTheDocument();
    await user.click(chooseAnother);

    expect(cloneStatus()).toBe('idle');
    expect(draftName()).toBe('Existing draft');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select a past show to clone/i })).toBeVisible();
  });

  it('on failure with the source no longer listed, still offers Choose another show', async () => {
    mockGetClassesByTrialId.mockResolvedValueOnce({ data: [], error: new Error('offline') });
    const { rerender } = await pickSourceShow();
    await waitFor(() => expect(cloneStatus()).toBe('failed'));

    queryState.current = { data: [], isLoading: false, isError: true };
    rerender(<CloneUi />);

    expect(screen.queryByRole('button', { name: /retry clone/i })).not.toBeInTheDocument();
    expectTouchTarget(screen.getByRole('button', { name: /choose another show/i }));
  });

  it('after a clone applies, Start fresh still resets the wizard', async () => {
    mockGetClassesByTrialId.mockResolvedValueOnce({ data: [], error: null });
    const { user } = await pickSourceShow();
    await waitFor(() => expect(cloneStatus()).toBe('ready'));

    const banner = screen.getByTestId('clone-status');
    expect(within(banner).getByText('Heartland Spring Trial')).toBeVisible();
    const startFresh = within(banner).getByRole('button', { name: /start fresh/i });
    expectTouchTarget(startFresh);
    await user.click(startFresh);

    expect(cloneStatus()).toBe('idle');
    expect(draftName()).toBe('');
  });
});
