import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { renderHook } from '@/test/utils/testUtils';
import { EntryStatus } from '@/types/show-registration-types';
import type { BulkStatusChangeOptions, EntryManagementEntry } from '@/types/entry-management-types';
import {
  groupByRegistration,
  useDecisionEmailedStatusChange,
} from './useDecisionEmailedStatusChange';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

type BulkFn = (
  entryIds: string[],
  status: EntryStatus,
  onFullSuccess?: () => void,
  options?: BulkStatusChangeOptions
) => Promise<boolean | void>;

const lifecycle = {
  plan: 'send' as 'send' | 'preview' | 'none',
  decisionEmailPlan: vi.fn(),
  openDecisionPrompt: vi.fn(),
  sendDecisionEmail: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.plan = 'send';
  lifecycle.decisionEmailPlan.mockImplementation(() => lifecycle.plan);
});

function entry(id: string, registrationId: string, overrides = {}): EntryManagementEntry {
  return {
    id,
    registrationId,
    showId: 'show-1',
    dogName: 'Rex',
    entryStatus: EntryStatus.PENDING,
    classes: [{ name: `Class ${id}` }],
    ...overrides,
  } as unknown as EntryManagementEntry;
}

const formEntries = [entry('e1', 'reg-1'), entry('e2', 'reg-1'), entry('e3', 'reg-1')];
const twoForms = [...formEntries, entry('e4', 'reg-2', { dogName: 'Bess' })];

function setup(entries: EntryManagementEntry[]) {
  const onStatusChange = vi.fn(async () => true as boolean | void);
  const onBulkStatusChange = vi.fn<BulkFn>(async () => true);
  const view = renderHook(() =>
    useDecisionEmailedStatusChange({
      entries,
      showName: 'Show A',
      lifecycleEmails: lifecycle,
      onStatusChange,
      onBulkStatusChange,
    })
  );
  return { handlers: view.result.current, onStatusChange, onBulkStatusChange };
}

const stoodOf = (mock: { mock: { calls: Parameters<BulkFn>[] } }) =>
  mock.mock.calls[0]?.[3]?.onStood;

describe('Accept on an entry form: one email per form (MYK9-1800)', () => {
  it('sends ONE email covering all three classes, only once the decision stands', async () => {
    const { onBulkStatusChange, handlers } = setup(formEntries);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);

    expect(lifecycle.sendDecisionEmail).not.toHaveBeenCalled();
    const decided = formEntries.map(e => ({ ...e, entryStatus: EntryStatus.ACCEPTED }));
    stoodOf(onBulkStatusChange)?.(decided);

    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledTimes(1);
    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledWith(decided, 'accepted', 'Show A');
  });

  it('Undo inside the window sends nothing (the handler never calls onStood)', async () => {
    const { onBulkStatusChange, handlers } = setup(formEntries);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);

    expect(stoodOf(onBulkStatusChange)).toBeTypeOf('function');
    expect(lifecycle.sendDecisionEmail).not.toHaveBeenCalled();
  });

  it('the bulk bar across two forms sends two emails, one per form', async () => {
    const { onBulkStatusChange, handlers } = setup(twoForms);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3', 'e4'], EntryStatus.WAITLIST);
    stoodOf(onBulkStatusChange)?.(twoForms);

    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledTimes(2);
    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledWith(formEntries, 'waitlisted', 'Show A');
    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledWith([twoForms[3]], 'waitlisted', 'Show A');
  });

  it('the per-entry control still sends one email for that entry', async () => {
    const { onStatusChange, handlers } = setup(formEntries);
    await handlers.onStatusChange('e2', EntryStatus.ACCEPTED);

    const options = onStatusChange.mock.calls[0] as unknown as [
      string,
      EntryStatus,
      string | undefined,
      { onStood?: (e: EntryManagementEntry) => void },
    ];
    options[3].onStood?.(formEntries[1]!);

    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledTimes(1);
    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledWith(
      [formEntries[1]],
      'accepted',
      'Show A'
    );
  });

  it('the email step switched off: nothing is armed, nothing opens', async () => {
    lifecycle.plan = 'none';
    const { onBulkStatusChange, handlers } = setup(formEntries);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);

    expect(onBulkStatusChange.mock.calls[0]?.[3]).toBeUndefined();
    expect(lifecycle.openDecisionPrompt).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('Reject sends no email and does not even ask for a plan', async () => {
    const { onBulkStatusChange, handlers } = setup(formEntries);
    await handlers.onBulkStatusChange(['e1', 'e2'], EntryStatus.REJECTED);

    expect(lifecycle.decisionEmailPlan).not.toHaveBeenCalled();
    expect(onBulkStatusChange.mock.calls[0]?.[3]).toBeUndefined();
  });

  it('writes the show she decided on, not the one on screen when the window closes', async () => {
    const onBulkStatusChange = vi.fn<BulkFn>(async () => true);
    const view = renderHook(
      ({ showName }: { showName: string }) =>
        useDecisionEmailedStatusChange({
          entries: formEntries,
          showName,
          lifecycleEmails: lifecycle,
          onStatusChange: vi.fn(),
          onBulkStatusChange,
        }),
      { initialProps: { showName: 'Show A' } }
    );
    await view.result.current.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);
    view.rerender({ showName: 'Show B' });
    stoodOf(onBulkStatusChange)?.(formEntries);

    expect(lifecycle.sendDecisionEmail).toHaveBeenCalledWith(formEntries, 'accepted', 'Show A');
  });
});

describe('preview plan (draft or finished show)', () => {
  beforeEach(() => {
    lifecycle.plan = 'preview';
  });

  it('one entry form: opens the preview with all the classes, and arms no send', async () => {
    const { onBulkStatusChange, handlers } = setup(formEntries);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);

    expect(onBulkStatusChange.mock.calls[0]?.[3]).toBeUndefined();
    expect(lifecycle.openDecisionPrompt).toHaveBeenCalledTimes(1);
    expect(lifecycle.openDecisionPrompt).toHaveBeenCalledWith(
      formEntries.map(e =>
        expect.objectContaining({ id: e.id, entryStatus: EntryStatus.ACCEPTED })
      ),
      'accepted'
    );
  });

  it('several forms: one plain notice, no dialogs and no send', async () => {
    const { handlers } = setup(twoForms);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3', 'e4'], EntryStatus.ACCEPTED);

    expect(lifecycle.openDecisionPrompt).not.toHaveBeenCalled();
    expect(lifecycle.sendDecisionEmail).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(
      '2 acceptance emails were not sent automatically. Use "Email Exhibitor" on each entry form.'
    );
  });

  it('a change that did not save opens nothing', async () => {
    const { onBulkStatusChange, handlers } = setup(formEntries);
    onBulkStatusChange.mockResolvedValueOnce(false);
    await handlers.onBulkStatusChange(['e1', 'e2', 'e3'], EntryStatus.ACCEPTED);

    expect(lifecycle.openDecisionPrompt).not.toHaveBeenCalled();
  });
});

describe('groupByRegistration: one email per form and owner', () => {
  it('splits one form whose dogs have different owners, so no owner sees another owner’s dog', () => {
    const groups = groupByRegistration([
      entry('e1', 'reg-1', { ownerEmail: 'a@example.com' }),
      entry('e2', 'reg-1', { ownerEmail: 'B@example.com ' }),
      entry('e3', 'reg-1', { ownerEmail: 'b@example.com' }),
    ]);
    expect(groups.map(g => g.map(e => e.id))).toEqual([['e1'], ['e2', 'e3']]);
  });

  it('keeps one form with one owner as one email', () => {
    const groups = groupByRegistration(
      formEntries.map(e => ({ ...e, ownerEmail: 'a@example.com' }))
    );
    expect(groups).toHaveLength(1);
  });
});
