/**
 * MYK9-1086 entry list redesign: ribbon colours, the scored-row result column,
 * the check-in icon map, and the in-ring / up-next cards.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { CHECKIN_STATUSES } from '@myk9/core';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps } from './pageProps';
import { getRibbonColor, NEUTRAL_RIBBON } from './ribbonColors';
import { CompletedResult } from './CompletedResult';
import { getCheckInPresentation } from './CheckInIndicator';
import { EntryListContent } from './components/EntryListContent';

const entry = (overrides: Partial<Entry> = {}): Entry =>
  ({
    id: 'e1',
    classId: '100',
    armband: 201,
    callName: 'Cooper',
    breed: 'Beagle',
    handler: 'Jordan Ellis',
    status: 'no-status',
    inRing: false,
    isScored: false,
    section: null,
    element: 'Container',
    level: 'Novice',
    ...overrides,
  }) as unknown as Entry;

describe('getRibbonColor', () => {
  it('uses yellow for AKC 3rd and green for UKC 3rd', () => {
    expect(getRibbonColor('AKC', 3).background).toBe('#f2c230');
    expect(getRibbonColor('UKC', 3).background).toBe('#2f7d32');
  });

  it('gives ASCA the AKC colours and blue first everywhere', () => {
    expect(getRibbonColor('ASCA', 4)).toEqual(getRibbonColor('AKC', 4));
    expect(getRibbonColor('UKC', 1)).toEqual(getRibbonColor('AKC', 1));
  });

  it('falls back to neutral beyond 4th or with no placement', () => {
    expect(getRibbonColor('AKC', 5)).toBe(NEUTRAL_RIBBON);
    expect(getRibbonColor('UKC', 0)).toBe(NEUTRAL_RIBBON);
  });
});

describe('CompletedResult', () => {
  it('shows time and faults for a qualified dog with a fault', () => {
    render(
      <CompletedResult
        entry={entry({ isScored: true, resultText: 'Q', searchTime: '1:02.05', faultCount: 1 })}
        registry="AKC"
      />
    );
    expect(screen.getByText('1 fault')).toBeTruthy();
    expect(screen.getByTestId('completed-result').textContent).toContain('Q');
  });

  it('shows no fault line when there are no faults', () => {
    render(
      <CompletedResult
        entry={entry({ isScored: true, resultText: 'Q', searchTime: '0:38.74', faultCount: 0 })}
      />
    );
    expect(screen.queryByText(/fault/)).toBeNull();
  });

  it('shows only the reason for an NQ: no time, no faults', () => {
    render(
      <CompletedResult
        entry={entry({
          isScored: true,
          resultText: 'NQ',
          searchTime: '1:21.40',
          faultCount: 2,
          nqReason: 'Incorrect call',
        })}
      />
    );
    const text = screen.getByTestId('completed-result').textContent ?? '';
    expect(text).toContain('Incorrect call');
    expect(text).not.toContain('1:21');
    expect(text).not.toContain('fault');
  });

  it('shows the placement as a ribbon in the registry colour', () => {
    render(
      <CompletedResult
        entry={entry({ isScored: true, resultText: 'Q', placement: 3, searchTime: '0:51.66' })}
        registry="UKC"
      />
    );
    const ribbon = screen.getByTestId('placement-ribbon');
    expect(ribbon.textContent).toBe('3rd');
    expect(ribbon.getAttribute('style')).toContain('rgb(47, 125, 50)');
  });

  it('hides time and placement when their release flags are off', () => {
    render(
      <CompletedResult
        entry={entry({
          isScored: true,
          resultText: 'Q',
          placement: 1,
          searchTime: '0:38.74',
          showPlacement: false,
          showTime: false,
        })}
      />
    );
    expect(screen.queryByTestId('placement-ribbon')).toBeNull();
    expect(screen.getByTestId('completed-result').textContent).not.toContain('38');
  });
});

describe('MYK9-1086 review fixes', () => {
  it('hides the NQ reason from a viewer outside the ring team', () => {
    render(
      <CompletedResult
        entry={entry({ isScored: true, resultText: 'NQ', nqReason: 'Incorrect call' })}
        showReason={false}
      />
    );
    const text = screen.getByTestId('completed-result').textContent ?? '';
    expect(text).toContain('NQ');
    expect(text).not.toContain('Incorrect call');
  });

  it('shows a bare Excused, never the excusal detail, outside the ring team', () => {
    render(
      <CompletedResult
        entry={entry({ isScored: true, resultText: 'Excused', excusedReason: 'Dog fouled ring' })}
        showReason={false}
      />
    );
    expect(screen.getByTestId('completed-result').textContent).toBe('Excused');
  });

  it('shows a stored disqualification as Disqualified with its reason to the ring team only', () => {
    const dq = entry({
      isScored: true,
      resultText: 'disqualified',
      nqReason: 'Attacked a person in the search area',
    });
    const { unmount } = render(<CompletedResult entry={dq} />);
    expect(screen.getByTestId('completed-result').textContent).toBe(
      'Disqualified · Attacked a person in the search area'
    );
    unmount();

    render(<CompletedResult entry={dq} showReason={false} />);
    expect(screen.getByTestId('completed-result').textContent).toBe('Disqualified');
  });

  it('shows Excused once, not as code plus reason', () => {
    render(<CompletedResult entry={entry({ isScored: true, resultText: 'Excused' })} />);
    expect(screen.getByTestId('completed-result').textContent).toBe('Excused');
  });

  it('does not render a zero time for a qualified dog', () => {
    render(<CompletedResult entry={entry({ isScored: true, resultText: 'Q', searchTime: '0' })} />);
    expect(screen.getByTestId('completed-result').textContent).toBe('Q');
  });
});

describe('getCheckInPresentation', () => {
  it('covers every check-in status with a label', () => {
    for (const status of CHECKIN_STATUSES) {
      expect(getCheckInPresentation(status).label.length).toBeGreaterThan(0);
    }
  });

  it('shows no word for the two common states and a word for the rest', () => {
    expect(getCheckInPresentation('checked-in').showWord).toBe(false);
    expect(getCheckInPresentation('no-status').showWord).toBe(false);
    expect(getCheckInPresentation('at-gate').showWord).toBe(true);
    expect(getCheckInPresentation('conflict').showWord).toBe(true);
  });

  it('never crashes on an unknown status', () => {
    expect(getCheckInPresentation('something-new').Icon).toBeTruthy();
  });
});

const StubDogCard: ComponentType<DogCardProps> = ({ callName, variant }) => (
  <div data-testid="dog-card" data-variant={variant ?? ''}>
    {callName}
  </div>
);

const renderContent = (entries: Entry[], showNowAndNext = true) =>
  render(
    <EntryListContent
      entries={entries}
      activeTab="pending"
      isDragMode={false}
      hasPermission={() => true}
      onEntryClick={vi.fn()}
      onStatusClick={vi.fn()}
      onResetMenuClick={vi.fn()}
      onSelfCheckinDisabled={vi.fn()}
      sensors={[]}
      onDragStart={vi.fn()}
      onDragEnd={vi.fn() as () => Promise<void>}
      showNowAndNext={showNowAndNext}
      DogCard={StubDogCard}
    />
  );

describe('EntryListContent now and next (MYK9-1086)', () => {
  const dogs = [
    entry({
      id: 'a',
      callName: 'Willow',
      armband: 200,
      status: 'in-ring',
      inRing: true,
      exhibitorOrder: 1,
    } as Partial<Entry>),
    entry({
      id: 'b',
      callName: 'Cooper',
      armband: 201,
      status: 'at-gate',
      exhibitorOrder: 2,
    } as Partial<Entry>),
    entry({
      id: 'c',
      callName: 'Maple',
      armband: 202,
      status: 'checked-in',
      exhibitorOrder: 3,
    } as Partial<Entry>),
  ];

  it('puts the in-ring dog in the hero and the next runner in Up next, once each', () => {
    renderContent(dogs);
    const cards = screen.getAllByTestId('dog-card');
    expect(cards.map(c => [c.textContent, c.getAttribute('data-variant')])).toEqual([
      ['Willow', 'hero'],
      ['Cooper', 'next'],
      ['Maple', ''],
    ]);
  });

  it('shows the Ring is clear placeholder when no dog is in the ring', () => {
    renderContent(dogs.slice(1));
    expect(screen.getByTestId('ring-clear').textContent).toContain('Ring is clear');
    expect(screen.getAllByTestId('dog-card')[0]?.getAttribute('data-variant')).toBe('next');
  });

  it('keeps Ring is clear as tall as the hero card it replaced', () => {
    const original = globalThis.ResizeObserver;
    class FakeResizeObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe() {
        this.cb(
          [
            {
              borderBoxSize: [{ blockSize: 152, inlineSize: 343 }],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        );
      }
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    try {
      const view = renderContent(dogs);
      view.rerender(
        <EntryListContent
          entries={dogs.slice(1)}
          activeTab="pending"
          isDragMode={false}
          hasPermission={() => true}
          onEntryClick={vi.fn()}
          onStatusClick={vi.fn()}
          onResetMenuClick={vi.fn()}
          onSelfCheckinDisabled={vi.fn()}
          sensors={[]}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn() as () => Promise<void>}
          showNowAndNext
          DogCard={StubDogCard}
        />
      );
      expect(screen.getByTestId('ring-clear').style.minHeight).toBe('152px');
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it('renders a plain list when now-and-next is off', () => {
    renderContent(dogs, false);
    expect(screen.queryByTestId('ring-clear')).toBeNull();
    expect(
      screen.getAllByTestId('dog-card').every(c => c.getAttribute('data-variant') === '')
    ).toBe(true);
  });
});
