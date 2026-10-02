/**
 * MYK9-931 (Codex round 7): the wizard stored a trial as one `dateTime`, so a date
 * pick could write a default 08:00 into it and a typed time could be shadowed by
 * it. A trial now stores its DATE and its typed START TIME separately and
 * `combineTrialDateTime` is the only place they are joined. Review shows exactly
 * what the payload will save, and a missing time is "Not set" and blocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ReviewStep } from '@/components/shows/wizard/steps/ReviewStep';
import { combineTrialDateTime } from '@/components/trials/trialDateTime';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { buildCreateShowPayload } from '../buildCreateShowPayload';
import type { WizardShowData } from '../showCreationWizardTransformers';

const mocks = vi.hoisted(() => ({
  trial: {} as Record<string, unknown>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));

const show = {
  name: 'Spring Classic',
  organization: 'AKC',
  startDate: '2026-08-14',
  endDate: '2026-08-16',
  entryOpenDate: '2026-06-01',
  entryCloseDate: '2026-06-25',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  location: 'Fairgrounds',
  clubId: 'club-1',
  judgeIds: [],
  officials: { chairman: ['p-1'], secretary: ['p-2'], steward: [] },
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
} as unknown as WizardShowData;

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: () => ({
    show,
    trials: [mocks.trial],
    judgeDetails: {},
    markStepCompleted: vi.fn(),
    setCurrentStep: vi.fn(),
  }),
}));

const trial = (patch: Record<string, unknown>) => ({
  id: 't1',
  nameOverride: 'Saturday Trial',
  eventNumber: '1',
  trialType: 'Scent Work',
  classes: [],
  ...patch,
});

const view = createWizardTrialView(
  [{ id: 't1', trialDate: '2026-08-15', nameOverride: 'Saturday Trial' }],
  []
);

const payloadOf = (t: Record<string, unknown>) =>
  buildCreateShowPayload(show, [t as never], {}, new Map(), 'unpublished', view).rpcInput
    .p_trials[0];

describe('combineTrialDateTime is the only join of the stored date and typed time', () => {
  it('joins a date and a valid time, in either order of entry', () => {
    expect(combineTrialDateTime('2026-08-15', '10:15 AM')).toBe('2026-08-15T10:15:00');
    expect(combineTrialDateTime('2026-08-15', '1:30 pm')).toBe('2026-08-15T13:30:00');
  });

  it('never invents a time or a date', () => {
    expect(combineTrialDateTime('2026-08-15', undefined)).toBe('');
    expect(combineTrialDateTime('2026-08-15', '')).toBe('');
    expect(combineTrialDateTime('2026-08-15', 'soon')).toBe('');
    expect(combineTrialDateTime('', '10:15 AM')).toBe('');
  });
});

describe('Review equals the payload', () => {
  it('time entered BEFORE the date: both read 10:15 AM on the date picked afterwards', () => {
    // Stored fields, as the wizard holds them once the date is picked after the time.
    mocks.trial = trial({ startTimeDraft: '10:15 AM', trialDate: '2026-08-15' });
    render(<ReviewStep trialView={view} />);
    expect(screen.getByText(/Aug 15, 2026 at 10:15 AM/)).toBeInTheDocument();
    const p = payloadOf(mocks.trial);
    expect(p?.date).toBe('2026-08-15');
    expect(p?.planned_start_time).toBe('10:15 AM');
  });

  it('date first, then time: the same', () => {
    mocks.trial = trial({ trialDate: '2026-08-15', startTimeDraft: '10:15 AM' });
    render(<ReviewStep trialView={view} />);
    expect(screen.getByText(/Aug 15, 2026 at 10:15 AM/)).toBeInTheDocument();
    expect(payloadOf(mocks.trial)?.planned_start_time).toBe('10:15 AM');
  });

  it('a date with no typed time shows "Not set", blocks Review, and the payload refuses', () => {
    mocks.trial = trial({ trialDate: '2026-08-15' });
    render(<ReviewStep trialView={view} />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText(/please enter a start time for saturday trial/i)).toBeInTheDocument();
    expect(() => payloadOf(mocks.trial)).toThrow(/start time for Saturday Trial/);
  });

  it('a cloned trial with no date yet shows "Not set", blocks, and the payload refuses', () => {
    mocks.trial = trial({ trialDate: '' });
    render(<ReviewStep trialView={view} />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText(/please select a date for saturday trial/i)).toBeInTheDocument();
    expect(() => payloadOf(mocks.trial)).toThrow(/date for Saturday Trial/);
  });
});
