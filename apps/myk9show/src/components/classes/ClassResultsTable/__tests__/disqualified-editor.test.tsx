import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QualificationCell } from '../QualificationCell';
import { useClassResults } from '../useClassResults';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { ScoringRow } from '../types';

const { updateEntry, notifyError } = vi.hoisted(() => ({
  updateEntry: vi.fn().mockResolvedValue(undefined),
  notifyError: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { updateEntry },
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: notifyError },
}));

function makeRow(overrides: Partial<ScoringRow> = {}): ScoringRow {
  return {
    entryId: 'e1',
    armband: '101',
    dogName: 'Rex',
    dogBreed: 'Labrador',
    handlerName: 'Alice Smith',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    faults: '0',
    notes: '',
    placement: null,
    checkInStatus: 'no-status',
    isScored: true,
    hasEdits: false,
    ...overrides,
  };
}

function makeRaw(overrides: Partial<RawEntryRow> = {}): RawEntryRow {
  return {
    id: 'e1',
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband: '101',
    handler: 'Alice Smith',
    result_status: 'pending',
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: 'checked-in',
    run_order: 1,
    dog: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  } as RawEntryRow;
}

function setup(raw: RawEntryRow) {
  return renderHook(() =>
    useClassResults({
      entries: [{ id: 'e1' } as ScentWorkEntry],
      rawEntries: [raw],
      classConfig: {} as ScentWorkClassConfig,
      userPermissions: { canEditEntries: true } as UserPermissions,
      classId: 'c1',
    })
  );
}

beforeEach(() => {
  updateEntry.mockClear();
  notifyError.mockClear();
});

describe('class results editor: Disqualified (MYK9-1011)', () => {
  it('saves a DQ with its reason and no placement', async () => {
    const { result } = setup(makeRaw());
    act(() => result.current.onFieldChange('e1', 'qualification', 'Disqualified'));
    act(() => result.current.onFieldChange('e1', 'qualificationReason', 'Aggression toward judge'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'disqualified',
        resultStatus: 'disqualified',
        disqualification_reason: 'Aggression toward judge',
        finalPlacement: null,
      })
    );
  });

  it('blocks the save without a reason (blank counts as missing)', async () => {
    const { result } = setup(makeRaw());
    act(() => result.current.onFieldChange('e1', 'qualification', 'Disqualified'));
    act(() => result.current.onFieldChange('e1', 'qualificationReason', '   '));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateEntry).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(
      expect.stringMatching(/Disqualified requires a reason/)
    );
  });

  it('shows an existing DQ row with its reason preserved', () => {
    const { result } = setup(
      makeRaw({
        result_status: 'disqualified',
        is_scored: true,
        disqualification_reason: 'Aggression toward judge',
      })
    );
    const row = result.current.rows[0]!;
    expect(row.qualification).toBe('Disqualified');
    expect(row.qualificationReason).toBe('Aggression toward judge');
  });

  it('renders the reason input for DQ, pre-filled, and reports edits', () => {
    const onUpdate = vi.fn();
    render(
      <QualificationCell
        item={makeRow({ qualification: 'Disqualified', qualificationReason: 'Fought' })}
        canEdit
        visible
        onUpdate={onUpdate}
      />
    );
    expect(screen.getByText('DQ')).toBeInTheDocument();
    expect(screen.getByLabelText(/disqualification reason/i)).toHaveValue('Fought');
  });

  it('read-only view shows DQ and its reason', () => {
    render(
      <QualificationCell
        item={makeRow({ qualification: 'Disqualified', qualificationReason: 'Fought' })}
        canEdit={false}
        visible
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText('DQ')).toBeInTheDocument();
    expect(screen.getByText('Fought')).toBeInTheDocument();
  });
});
