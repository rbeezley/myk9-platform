import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { Dog } from '@/types/dog-types';
import type { RegistrationNeededRow } from '../management/registrationNeeded';
import { RegistrationNeededPane } from '../RegistrationNeededPane';
import {
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
} from '@/features/lifecycle-emails/api';
import {
  countRegistrationNumberNeededJobs,
  fetchRegistrationNumberNeededJobCounts,
} from '@/features/lifecycle-emails/registrationNumberNeeded';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs', () => ({
  default: () => null,
}));
vi.mock('@/features/lifecycle-emails/LifecycleEmailPreviewDialog', () => ({
  LifecycleEmailPreviewDialog: ({
    onSend,
  }: {
    onSend: (v: { subject: string; body: string; secretaryNote: string }) => void;
  }) => (
    <button type="button" onClick={() => onSend({ subject: 's', body: 'b', secretaryNote: '' })}>
      Confirm send
    </button>
  ),
}));
vi.mock('@/features/lifecycle-emails/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/lifecycle-emails/api')>()),
  fetchShowLifecycleEmailSummary: vi.fn(),
  saveLifecycleEmailJobForLater: vi.fn(),
  sendLifecycleEmailJobs: vi.fn(),
}));
vi.mock('@/features/lifecycle-emails/registrationNumberNeeded', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/features/lifecycle-emails/registrationNumberNeeded')
  >()),
  countRegistrationNumberNeededJobs: vi.fn(),
  fetchRegistrationNumberNeededJobCounts: vi.fn(),
}));

const summary = (isEnabled: boolean) => ({
  steps: [
    {
      stepType: 'registration_number_needed' as const,
      isEnabled,
      readyCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      dismissedCount: 0,
      warningCount: 0,
    },
  ],
  receipts: { sentCount: 0, failedCount: 0, latestSentAtByRegistrationId: {} },
});

function row(id: string, dogName: string, ownerEmail: string): RegistrationNeededRow {
  return {
    registryId: 'AKC',
    dog: { id: `dog-${id}`, callName: dogName } as Dog,
    entry: {
      id,
      showId: 'show-1',
      dogId: `dog-${id}`,
      dogName,
      ownerName: 'Pat',
      ownerEmail,
      classes: [{ id, name: 'Container Novice', number: '1', fee: 0, status: 'entered' }],
    } as unknown as EntryManagementEntry,
  };
}

const renderPane = (rows: RegistrationNeededRow[]) =>
  render(
    <RegistrationNeededPane
      showId="show-1"
      showName="Show"
      rows={rows}
      loading={false}
      unknown={false}
      onOpenEntry={() => undefined}
    />
  );

describe('RegistrationNeededPane email button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({});
    vi.mocked(countRegistrationNumberNeededJobs).mockResolvedValue(0);
    vi.mocked(saveLifecycleEmailJobForLater).mockResolvedValue('job-1');
    vi.mocked(sendLifecycleEmailJobs).mockResolvedValue({ sent: 1, failed: 0, total: 1 });
  });

  it('reads Email exhibitor with no prior job and Send reminder with one, from one read', async () => {
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({ e2: 1 });
    renderPane([row('e1', 'Scout', 'a@example.com'), row('e2', 'Juni', 'b@example.com')]);

    expect(await screen.findByRole('button', { name: 'Send reminder for Juni' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Email exhibitor for Scout' })).toBeVisible();
    expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalledTimes(1);
  });

  it('reads Email exhibitor while the counts are unavailable', async () => {
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockRejectedValue(new Error('offline'));
    renderPane([row('e1', 'Scout', 'a@example.com')]);

    expect(await screen.findByRole('button', { name: 'Email exhibitor for Scout' })).toBeVisible();
    await waitFor(() => expect(fetchRegistrationNumberNeededJobCounts).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Send reminder/ })).toBeNull();
  });

  it('flips to Send reminder after a successful send', async () => {
    const { user } = renderPane([row('e1', 'Scout', 'a@example.com')]);
    await user.click(await screen.findByRole('button', { name: 'Email exhibitor for Scout' }));
    vi.mocked(fetchRegistrationNumberNeededJobCounts).mockResolvedValue({ e1: 1 });

    await user.click(screen.getByRole('button', { name: 'Confirm send' }));

    expect(await screen.findByRole('button', { name: 'Send reminder for Scout' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Email exhibitor for Scout' })).toBeNull();
  });

  it('shows no email button when the step is off, and the phone notice when there is no address', async () => {
    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(false));
    const off = renderPane([row('e1', 'Scout', 'a@example.com')]);
    await waitFor(() => expect(fetchShowLifecycleEmailSummary).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Email exhibitor|Send reminder/ })).toBeNull();
    off.unmount();

    vi.mocked(fetchShowLifecycleEmailSummary).mockResolvedValue(summary(true));
    renderPane([row('e2', 'Juni', '')]);
    expect(await screen.findByText('No email on file. Contact by phone.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Email exhibitor|Send reminder/ })).toBeNull();
  });
});
