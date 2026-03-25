import { renderHook, act } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useScoringMode, ScoringProgress } from '../data-table-scoring-mode';

const baseRows = [
  { id: 'r1', time: '4532', result: '', faults: '', reason: '' },
  { id: 'r2', time: '3021', result: 'Qualify', faults: '0', reason: '' },
  { id: 'r3', time: '', result: '', faults: '', reason: '' },
];

const editableColumns = ['time', 'result', 'faults', 'reason'];

function makeHook(overrides?: Partial<Parameters<typeof useScoringMode>[0]>) {
  return renderHook(() =>
    useScoringMode({
      enabled: true,
      rows: baseRows,
      editableColumns,
      resultColumnId: 'result',
      scoredFieldId: 'result',
      conditionalFields: {
        reason: (row: unknown) => {
          const r = row as (typeof baseRows)[0];
          return r.result === 'NQ' || r.result === 'Eliminated';
        },
      },
      ...overrides,
    })
  );
}

describe('useScoringMode — handleResultKeystroke', () => {
  it('returns Qualify for Q', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('Q')).toBe('Qualify');
  });

  it('returns Qualify for q', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('q')).toBe('Qualify');
  });

  it('returns NQ for n', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('n')).toBe('NQ');
  });

  it('returns NQ for N', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('N')).toBe('NQ');
  });

  it('returns Eliminated for e', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('e')).toBe('Eliminated');
  });

  it('returns Absent for a', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('a')).toBe('Absent');
  });

  it('returns null for unknown key x', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('x')).toBeNull();
  });

  it('maps number 1 to Qualify', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('1')).toBe('Qualify');
  });

  it('maps number 2 to NQ', () => {
    const { result } = makeHook();
    expect(result.current.handleResultKeystroke('2')).toBe('NQ');
  });
});

describe('useScoringMode — getNextCell', () => {
  it('advances from time to result column', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r1', 'time');
    expect(next).toEqual({ rowId: 'r1', columnId: 'result' });
  });

  it('from result (Qualify) skips reason and goes to faults', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r1', 'result', 'Qualify');
    expect(next).toEqual({ rowId: 'r1', columnId: 'faults' });
  });

  it('from result (NQ) goes to faults', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r1', 'result', 'NQ');
    expect(next).toEqual({ rowId: 'r1', columnId: 'faults' });
  });

  it('from faults (Qualify) advances to next row time (skips reason)', () => {
    // Row has result=Qualify so reason is not editable
    const rows = [
      { id: 'r1', time: '4532', result: 'Qualify', faults: '', reason: '' },
      { id: 'r2', time: '3021', result: '', faults: '', reason: '' },
    ];
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows,
        editableColumns,
        resultColumnId: 'result',
        scoredFieldId: 'result',
        conditionalFields: {
          reason: (row: unknown) => {
            const r = row as (typeof rows)[0];
            return r.result === 'NQ' || r.result === 'Eliminated';
          },
        },
      })
    );
    const next = result.current.getNextCell('r1', 'faults');
    expect(next).toEqual({ rowId: 'r2', columnId: 'time' });
  });

  it('from faults (NQ) advances to reason column', () => {
    const rows = [
      { id: 'r1', time: '4532', result: 'NQ', faults: '', reason: '' },
      { id: 'r2', time: '3021', result: '', faults: '', reason: '' },
    ];
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows,
        editableColumns,
        resultColumnId: 'result',
        scoredFieldId: 'result',
        conditionalFields: {
          reason: (row: unknown) => {
            const r = row as (typeof rows)[0];
            return r.result === 'NQ' || r.result === 'Eliminated';
          },
        },
      })
    );
    const next = result.current.getNextCell('r1', 'faults');
    expect(next).toEqual({ rowId: 'r1', columnId: 'reason' });
  });

  it('from reason advances to next row time', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r1', 'reason');
    expect(next).toEqual({ rowId: 'r2', columnId: 'time' });
  });

  it('from result (Absent) advances to next row time', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r1', 'result', 'Absent');
    expect(next).toEqual({ rowId: 'r2', columnId: 'time' });
  });

  it('returns null when on last row and last column', () => {
    const { result } = makeHook();
    const next = result.current.getNextCell('r3', 'reason');
    expect(next).toBeNull();
  });
});

describe('useScoringMode — isFieldEditable', () => {
  it('returns false for reason when result is Qualify', () => {
    const rows = [{ id: 'r1', time: '4532', result: 'Qualify', faults: '', reason: '' }];
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows,
        editableColumns,
        resultColumnId: 'result',
        conditionalFields: {
          reason: (row: unknown) => {
            const r = row as (typeof rows)[0];
            return r.result === 'NQ' || r.result === 'Eliminated';
          },
        },
      })
    );
    expect(result.current.isFieldEditable('r1', 'reason')).toBe(false);
  });

  it('returns true for reason when result is NQ', () => {
    const rows = [{ id: 'r1', time: '4532', result: 'NQ', faults: '', reason: '' }];
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows,
        editableColumns,
        resultColumnId: 'result',
        conditionalFields: {
          reason: (row: unknown) => {
            const r = row as (typeof rows)[0];
            return r.result === 'NQ' || r.result === 'Eliminated';
          },
        },
      })
    );
    expect(result.current.isFieldEditable('r1', 'reason')).toBe(true);
  });

  it('returns true for faults regardless of result', () => {
    const rows = [{ id: 'r1', time: '4532', result: 'Qualify', faults: '', reason: '' }];
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows,
        editableColumns,
        resultColumnId: 'result',
        conditionalFields: {
          reason: (row: unknown) => {
            const r = row as (typeof rows)[0];
            return r.result === 'NQ' || r.result === 'Eliminated';
          },
        },
      })
    );
    expect(result.current.isFieldEditable('r1', 'faults')).toBe(true);
  });

  it('returns false when scoring mode is disabled', () => {
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: false,
        rows: baseRows,
        editableColumns,
      })
    );
    expect(result.current.isFieldEditable('r1', 'time')).toBe(false);
  });
});

describe('useScoringMode — progress', () => {
  it('scoredCount counts rows with non-empty scored field', () => {
    const { result } = makeHook();
    // baseRows: r2 has result='Qualify', r1 and r3 have result=''
    expect(result.current.scoredCount).toBe(1);
    expect(result.current.totalCount).toBe(3);
  });

  it('scoredCount is 0 when scoredFieldId is not set', () => {
    const { result } = renderHook(() =>
      useScoringMode({
        enabled: true,
        rows: baseRows,
        editableColumns,
      })
    );
    expect(result.current.scoredCount).toBe(0);
    expect(result.current.totalCount).toBe(3);
  });
});

describe('useScoringMode — undo stack', () => {
  it('undo returns last pushed entry and removes it from stack', () => {
    const { result } = makeHook();
    act(() => {
      result.current.pushUndo('r1', 'time', '4532');
      result.current.pushUndo('r1', 'result', '');
    });
    let undone: ReturnType<typeof result.current.undo>;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual({ rowId: 'r1', columnId: 'result', value: '' });
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual({ rowId: 'r1', columnId: 'time', value: '4532' });
  });

  it('undo returns null when stack is empty', () => {
    const { result } = makeHook();
    let undone: ReturnType<typeof result.current.undo>;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBeNull();
  });

  it('limits undo stack to 50 entries', () => {
    const { result } = makeHook();
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.pushUndo('r1', 'time', String(i));
      }
    });
    // Pop all entries — should only get 50
    const entries: unknown[] = [];
    act(() => {
      let entry = result.current.undo();
      while (entry !== null) {
        entries.push(entry);
        entry = result.current.undo();
      }
    });
    expect(entries).toHaveLength(50);
  });
});

describe('ScoringProgress', () => {
  it('renders "X of Y scored"', () => {
    render(<ScoringProgress scored={3} total={10} />);
    expect(screen.getByText('3 of 10 scored')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    const { container } = render(<ScoringProgress scored={5} total={10} />);
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar).toBeInTheDocument();
    expect(bar.style.width).toBe('50%');
  });

  it('handles zero total gracefully', () => {
    render(<ScoringProgress scored={0} total={0} />);
    expect(screen.getByText('0 of 0 scored')).toBeInTheDocument();
  });
});
