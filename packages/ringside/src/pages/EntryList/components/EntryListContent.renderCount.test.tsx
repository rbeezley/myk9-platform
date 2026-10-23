/**
 * Render-count contract for `EntryListContent` on a 60-dog class (MYK9-1365).
 *
 * A realtime nudge changes one dog's status every few seconds. The list must
 * update THAT card in place: the other 59 cards must not render, and the
 * changed card must not unmount (a remount re-registers `useSortable`, re-runs
 * mount effects and drops the check-in badge's pulse state).
 *
 * Renders are counted at the injected `DogCard` slot, which renders exactly
 * when the card BODY does. dnd-kit re-renders every `useSortable` shell when
 * the hovered slot changes; the body memo is what keeps that off the list.
 *
 * Measured on this fixture (DogCard renders), original code -> MYK9-1365:
 *   one status change, rebuilt entry array   60 -> 1   (changed card mounts 2 -> 1)
 *   re-render, same entries, new callbacks   60 -> 0
 *   keyboard drag, activation                240 -> 1
 *   keyboard drag, per frame (8 ArrowDowns)  [1,1,61,1,1,1,61,1] -> [0,0,0,0,0,0,0,0]
 */

import { act, fireEvent, render } from '@testing-library/react';
import { KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import type { Entry } from '../../../stores/entryStore';
import type { DogCardProps } from '../pageProps';
import { EntryListContent, type EntryListContentProps } from './EntryListContent';

const renders = new Map<number, number>();
const mounts = new Map<number, number>();

const bump = (map: Map<number, number>, armband: number | null) => {
  if (armband == null) return;
  map.set(armband, (map.get(armband) ?? 0) + 1);
};

const CountingDogCard: ComponentType<DogCardProps> = ({ armband, dragHandle, trailing }) => {
  bump(renders, armband);
  useEffect(() => {
    bump(mounts, armband);
  }, [armband]);
  return (
    <div data-testid="dog-card" data-armband={armband}>
      {trailing}
      {dragHandle}
    </div>
  );
};

const entry = (n: number, overrides: Partial<Entry> = {}): Entry =>
  ({
    id: `entry-${n}`,
    classId: '100',
    className: 'Container Novice',
    armband: n,
    callName: `Dog${n}`,
    breed: 'Lab',
    handler: 'Alice',
    status: 'no-status',
    inRing: false,
    isScored: false,
    exhibitorOrder: n,
    ...overrides,
  }) as unknown as Entry;

const sixty = (): Entry[] => Array.from({ length: 60 }, (_, i) => entry(i + 1));

const totalRenders = () => [...renders.values()].reduce((sum, n) => sum + n, 0);
const rendersFor = (armband: number) => renders.get(armband) ?? 0;
const mountsFor = (armband: number) => mounts.get(armband) ?? 0;

// Fresh callback identities on every call: the page re-creates several of
// them (an inline arrow for `onSelfCheckinDisabled`) on every render.
const propsFor = (
  entries: Entry[],
  overrides: Partial<EntryListContentProps> = {}
): EntryListContentProps => ({
  entries,
  activeTab: 'pending',
  isDragMode: false,
  hasPermission: permissionAllowAll,
  onEntryClick: vi.fn(),
  onStatusClick: vi.fn(),
  onResetMenuClick: vi.fn(),
  onSelfCheckinDisabled: () => undefined,
  onPrefetch: () => undefined,
  onOpenDragMode: () => undefined,
  sensors: [],
  onDragStart: vi.fn(),
  onDragEnd: vi.fn() as () => Promise<void>,
  DogCard: CountingDogCard,
  ...overrides,
});

// One identity for the whole file, like the page's memoised `hasPermission`.
function permissionAllowAll(): boolean {
  return true;
}

beforeEach(() => {
  renders.clear();
  mounts.clear();
});

describe('EntryListContent render counts (60 entries)', () => {
  it('a status change renders only the changed card and does not remount it', () => {
    const entries = sixty();
    const { rerender } = render(<EntryListContent {...propsFor(entries)} />);
    expect(totalRenders()).toBeGreaterThanOrEqual(60);
    expect(mountsFor(30)).toBe(1);
    renders.clear();

    // Realtime nudge: the whole array is rebuilt and every row is a new object,
    // exactly one of which differs.
    const next = entries.map(e => (e.armband === 30 ? { ...e, status: 'checked-in' } : { ...e }));
    rerender(<EntryListContent {...propsFor(next as Entry[])} />);

    expect(rendersFor(30)).toBe(1);
    expect(totalRenders()).toBeLessThanOrEqual(2);
    expect(mountsFor(30)).toBe(1);
  });

  it('a score does not remount the card either', () => {
    const entries = sixty();
    const { rerender } = render(<EntryListContent {...propsFor(entries)} />);
    renders.clear();

    const next = entries.map(e => (e.armband === 12 ? { ...e, isScored: true } : e));
    rerender(<EntryListContent {...propsFor(next as Entry[])} />);

    expect(rendersFor(12)).toBe(1);
    expect(totalRenders()).toBeLessThanOrEqual(2);
    expect(mountsFor(12)).toBe(1);
  });

  it('with the in-ring and up-next cards lifted, a check-in elsewhere renders one card', () => {
    const entries = sixty().map(e => (e.armband === 1 ? { ...e, status: 'in-ring' } : e));
    const { rerender } = render(
      <EntryListContent {...propsFor(entries as Entry[], { showNowAndNext: true })} />
    );
    renders.clear();

    const next = entries.map(e => (e.armband === 40 ? { ...e, status: 'at-gate' } : { ...e }));
    rerender(<EntryListContent {...propsFor(next as Entry[], { showNowAndNext: true })} />);

    expect(rendersFor(40)).toBe(1);
    expect(totalRenders()).toBeLessThanOrEqual(2);
    expect(mountsFor(40)).toBe(1);
  });

  it('a re-render with the same entries and new callback identities renders no card', () => {
    const entries = sixty();
    const { rerender } = render(<EntryListContent {...propsFor(entries)} />);
    renders.clear();

    // Also proves the SortableContext items array is referentially stable: a
    // new array would update every useSortable consumer.
    rerender(<EntryListContent {...propsFor(entries)} />);

    expect(totalRenders()).toBe(0);
  });

  it('a keyboard drag does not re-render the whole list per frame', async () => {
    // jsdom measures every box as 0x0, so no drop target is ever "over". Lay the
    // cards out one per 100px row so each ArrowDown (25px) moves the drag and
    // the hovered slot changes every few frames.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      const card = this.querySelector('[data-armband]') ?? this;
      const n = Number(card.getAttribute('data-armband'));
      const top = Number.isFinite(n) && n > 0 ? (n - 1) * 100 : 0;
      const size =
        Number.isFinite(n) && n > 0 ? { width: 300, height: 90 } : { width: 0, height: 0 };
      return {
        ...size,
        top,
        left: 0,
        right: size.width,
        bottom: top + size.height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    try {
      const entries = sixty();
      const Harness = () => {
        const sensors = useSensors(useSensor(KeyboardSensor));
        return <EntryListContent {...propsFor(entries, { isDragMode: true, sensors })} />;
      };
      const { container } = render(<Harness />);
      const handle = container.querySelector('[aria-roledescription="sortable"]') as HTMLElement;
      expect(handle).not.toBeNull();
      renders.clear();

      act(() => {
        handle.focus();
        fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
      });
      // The sensor attaches its keydown listener on a timer after activation.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const start = totalRenders();

      const frames: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        renders.clear();
        act(() => {
          fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
        });
        frames.push(totalRenders());
      }

      // Only the dragged card's body may render: the other cards' shells do (dnd-kit),
      // their bodies must not.
      expect(start).toBeLessThanOrEqual(2);
      for (const frame of frames) expect(frame).toBeLessThanOrEqual(2);
    } finally {
      rect.mockRestore();
    }
  });
});
