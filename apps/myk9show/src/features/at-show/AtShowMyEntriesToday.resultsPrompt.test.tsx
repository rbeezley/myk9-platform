import '@/test/utils/pageRenderWait';
/**
 * MYK9-1944: "asked once" holds on Ringside's list too: two placed, released rows show one prompt.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

vi.mock('./menu/RingsideMenu', () => ({ RingsideMenu: () => null }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/notifications', () => ({ notifications: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { sync: vi.fn(), subscribe: vi.fn(() => () => undefined) },
}));
vi.mock('@/components/preferences/ResultsPublicPrompt', () => ({
  ResultsPublicPrompt: (props: { dogName: string }) => (
    <div data-testid="prompt">{props.dogName}</div>
  ),
}));

function placed(entryId: string, dogName: string, startTime: string): AtShowEntryDetail {
  return {
    entryId,
    classId: `class-${entryId}`,
    dogName,
    dogKey: `dog-${entryId}`,
    armband: '101',
    checkInStatus: 'completed',
    className: 'Container Novice',
    expectedStartLabel: startTime,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: true,
    resultStatus: 'qualified',
    resultTimeSeconds: 40,
    resultFaults: 0,
    resultLine: 'Qualified, 0:40.00, 1st of 5',
    isPreliminary: false,
    releasedPlacement: 1,
    selfCheckinState: 'allowed',
    trialLabel: null,
    runOrder: 1,
    startTime,
    trialTimezone: 'America/Chicago',
  };
}

describe('AtShowMyEntriesToday results-public prompt (MYK9-1944)', () => {
  it('two placed, released rows render exactly one prompt', () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        showName="Spring Scent Trial"
        entries={[placed('a', 'Juni', '9:00 AM'), placed('b', 'Rex', '10:00 AM')]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('prompt')).toHaveLength(1);
  });
});
