import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../../stores/entryStore';
import type { ClassInfo } from '../types';
import {
  ClassCompletionPresentation,
  markClassCompletionPending,
} from './ClassCompletionPresentation';

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
    resultText: 'not_qualified',
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
    expect(screen.getByText('qualified').parentElement?.textContent).toBe('3qualified');
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
});
