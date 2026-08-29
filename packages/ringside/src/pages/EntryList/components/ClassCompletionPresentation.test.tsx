import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../../stores/entryStore';
import type { ClassInfo } from '../types';
import {
  ClassCompletionPresentation,
  ClassPodium,
  markClassCompletionPending,
} from './ClassCompletionPresentation';
import {
  __resetClassCompletionMemoForTests, COMPLETION_INTENT_MAX_AGE_MS } from './classCompletionStorage';

const { confettiBurst } = vi.hoisted(() => ({
  confettiBurst: vi.fn(),
}));

vi.mock('canvas-confetti', () => ({
  default: {
    create: vi.fn(() => confettiBurst),
  },
}));

const entries: Entry[] = [
  {
    id: 'entry-1',
    classId: 'class-1',
    armband: 101,
    callName: 'Rex',
    breed: 'Border Collie',
    handler: 'Jane Handler',
    isScored: true,
    status: 'completed',
    resultText: 'qualified',
    placement: 1,
    className: 'Container Novice',
  },
  {
    id: 'entry-2',
    classId: 'class-1',
    armband: 102,
    callName: 'Moxie',
    breed: 'Australian Shepherd',
    handler: 'Sam Handler',
    isScored: true,
    status: 'completed',
    resultText: 'qualified',
    placement: 2,
    className: 'Container Novice',
  },
  {
    id: 'entry-3',
    classId: 'class-1',
    armband: 103,
    callName: 'Dash',
    breed: 'Labrador Retriever',
    handler: 'Kai Handler',
    isScored: true,
    status: 'completed',
    resultText: 'qualified',
    placement: 3,
    className: 'Container Novice',
  },
  {
    id: 'entry-4',
    classId: 'class-1',
    armband: 104,
    callName: 'Pip',
    breed: 'Beagle',
    handler: 'Lee Handler',
    isScored: true,
    status: 'completed',
    resultText: 'qualified',
    placement: 4,
    className: 'Container Novice',
  },
];

const releasedClass: ClassInfo = {
  className: 'Container Novice',
  element: 'Container',
  level: 'Novice',
  resultsReleasedAt: '2026-07-24T16:00:00.000Z',
  isScoringFinalized: true,
  actualStartTime: '2026-07-24T15:15:00.000Z',
  actualEndTime: '2026-07-24T16:00:00.000Z',
};

function PresentationHarness({
  classId = 'class-1',
  classInfo = releasedClass,
  presentationEntries = entries,
  initialTab = 'pending',
  onSelectCompleted = vi.fn(),
}: {
  classId?: string;
  classInfo?: ClassInfo;
  presentationEntries?: Entry[];
  initialTab?: 'pending' | 'completed';
  onSelectCompleted?: () => void;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <ClassCompletionPresentation
      classId={classId}
      classInfo={classInfo}
      entries={presentationEntries}
      activeTab={activeTab}
      onSelectCompleted={() => {
        onSelectCompleted();
        setActiveTab('completed');
      }}
    />
  );
}

describe('ClassCompletionPresentation', () => {
  beforeEach(() => {
    localStorage.clear();
    // localStorage.clear() does NOT reach the module-scope memos in
    // classCompletionStorage, so a celebration claimed by an earlier test file
    // stayed claimed here. Order-dependent, and CI runs --sequence.shuffle.
    __resetClassCompletionMemoForTests();
    confettiBurst.mockClear();
    vi.mocked(window.matchMedia).mockImplementation(
      query =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    );
  });

  it('shows the released podium and celebrates a final-score intent exactly once', async () => {
    const onSelectCompleted = vi.fn();
    markClassCompletionPending('class-1');

    const firstRender = render(<PresentationHarness onSelectCompleted={onSelectCompleted} />);

    expect(await screen.findByRole('region', { name: 'Class complete' })).not.toBeNull();
    expect(onSelectCompleted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Class podium' })).not.toBeNull();
    expect(screen.getByText('45 minutes')).not.toBeNull();
    expect(screen.getByText('entries scored').parentElement?.textContent).toBe('4entries scored');
    expect(screen.getByText('qualified').parentElement?.textContent).toBe('4qualified');
    expect(screen.getAllByTestId('podium-position')).toHaveLength(4);
    expect(confettiBurst).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close celebration' }));
    firstRender.unmount();

    render(<PresentationHarness initialTab="completed" />);

    expect(screen.getByRole('region', { name: 'Class podium' })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Class complete' })).toBeNull();
    expect(confettiBurst).toHaveBeenCalledTimes(1);
  });

  it('shows neither podium nor celebration before results are released', async () => {
    markClassCompletionPending('class-1');

    render(
      <PresentationHarness
        initialTab="completed"
        classInfo={{ ...releasedClass, resultsReleasedAt: null }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Class podium' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Class complete' })).toBeNull();
    });
    expect(confettiBurst).not.toHaveBeenCalled();
  });

  it('defers to server finalization when an excluded entry remains unscored', () => {
    const scratchedEntry: Entry = {
      ...entries[3],
      id: 'entry-scratched',
      isScored: false,
    };
    delete scratchedEntry.placement;

    render(
      <PresentationHarness
        initialTab="completed"
        presentationEntries={[...entries, scratchedEntry]}
      />
    );

    expect(screen.getByRole('region', { name: 'Class podium' })).not.toBeNull();
    expect(screen.getAllByTestId('podium-position')).toHaveLength(4);
  });

  it('always shows an elapsed-time value in the completion summary', async () => {
    markClassCompletionPending('class-3');
    const untimedClass = { ...releasedClass };
    delete untimedClass.actualStartTime;
    delete untimedClass.actualEndTime;
    const untimedEntries = entries.map(entry => {
      const untimedEntry = { ...entry };
      delete untimedEntry.scoredAt;
      delete untimedEntry.ringEntryTime;
      delete untimedEntry.ringExitTime;
      return untimedEntry;
    });

    render(
      <PresentationHarness
        classId="class-3"
        classInfo={untimedClass}
        presentationEntries={untimedEntries}
      />
    );

    expect(await screen.findByText('Not recorded')).not.toBeNull();
    expect(screen.getByText('elapsed')).not.toBeNull();
  });

  it('keeps the summary but suppresses confetti for reduced-motion users', async () => {
    vi.mocked(window.matchMedia).mockImplementation(
      query =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    );
    markClassCompletionPending('class-2');

    render(<PresentationHarness classId="class-2" />);

    expect(await screen.findByRole('region', { name: 'Class complete' })).not.toBeNull();
    expect(confettiBurst).not.toHaveBeenCalled();
  });

  it('does not replay a stale completion intent or change the selected tab', async () => {
    const now = Date.parse('2026-07-24T16:00:00.000Z');
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    const onSelectCompleted = vi.fn();
    markClassCompletionPending('class-stale');
    dateNow.mockReturnValue(now + COMPLETION_INTENT_MAX_AGE_MS + 1);

    render(<PresentationHarness classId="class-stale" onSelectCompleted={onSelectCompleted} />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Class complete' })).toBeNull();
    });
    expect(onSelectCompleted).not.toHaveBeenCalled();
    expect(confettiBurst).not.toHaveBeenCalled();
    dateNow.mockRestore();
  });

  it('does not re-read completion storage after reaching an already-celebrated terminal state', async () => {
    markClassCompletionPending('class-terminal');
    const firstRender = render(
      <PresentationHarness classId="class-terminal" initialTab="completed" />
    );
    expect(await screen.findByRole('region', { name: 'Class complete' })).not.toBeNull();
    firstRender.unmount();

    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    const secondRender = render(
      <PresentationHarness classId="class-terminal" initialTab="completed" />
    );
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Class complete' })).toBeNull();
    });
    const readsAfterClaim = storageRead.mock.calls.length;

    secondRender.rerender(
      <PresentationHarness
        classId="class-terminal"
        initialTab="completed"
        classInfo={{ ...releasedClass }}
      />
    );

    await waitFor(() => {
      expect(storageRead).toHaveBeenCalledTimes(readsAfterClaim);
    });
    storageRead.mockRestore();
  });

  it('ignores non-integer placements and non-qualifying results', () => {
    const invalidPlacement: Entry = {
      ...entries[0],
      id: 'entry-invalid-placement',
      callName: 'Fraction',
      placement: 2.5,
    };
    const nonQualifyingPlacement: Entry = {
      ...entries[0],
      id: 'entry-nq-placement',
      callName: 'No Qualifier',
      resultText: 'not_qualified',
      placement: 4,
    };

    render(<ClassPodium entries={[...entries, invalidPlacement, nonQualifyingPlacement]} />);

    expect(screen.getAllByTestId('podium-position')).toHaveLength(4);
    expect(screen.queryByText('Fraction')).toBeNull();
    expect(screen.queryByText('No Qualifier')).toBeNull();
  });
});
