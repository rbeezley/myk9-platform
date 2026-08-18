/**
 * The registry is only useful if the bar actually registers.
 *
 * The first cut of this hook used `useRef` + `useEffect([id])`. Every store
 * test passed, because they wrote heights into the store directly and never
 * mounted anything. The wiring was broken the whole time: `SlideOverPanel`
 * returns null while closed, so a panel mounted with `open=false` has no footer
 * node when the effect first runs, and an effect keyed on a stable id never
 * re-runs when the panel later opens. The reservation never happened — in
 * exactly the closed-then-open flow every panel uses.
 *
 * These tests mount and unmount a conditionally-rendered bar, which is the
 * thing that was actually wrong.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { useRegisterActionBar } from '../useRegisterActionBar';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

const reserved = () => selectReservedBottom(useActionBarStore.getState());

/** jsdom reports 0 for every box, so stub the measurement. */
function stubHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: px, width: 100, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }),
  });
}

function Panel({ open }: { open: boolean }) {
  const setBar = useRegisterActionBar<HTMLDivElement>();
  // Mirrors SlideOverPanel: nothing is rendered while closed.
  if (!open) return null;
  return <div ref={setBar}>action bar</div>;
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)}>
        toggle
      </button>
      <Panel open={open} />
    </>
  );
}

beforeEach(() => {
  useActionBarStore.setState({ heights: {} });
  stubHeight(72);
});

describe('useRegisterActionBar', () => {
  it('reserves nothing while the panel is closed', () => {
    render(<Harness />);
    expect(reserved()).toBe(0);
  });

  it('registers when a panel that started CLOSED is opened', () => {
    render(<Harness />);
    act(() => screen.getByRole('button', { name: 'toggle' }).click());
    // The regression: with useEffect([id]) this stayed 0 forever.
    expect(reserved()).toBe(72);
  });

  it('releases the reservation when the panel closes again', () => {
    render(<Harness />);
    act(() => screen.getByRole('button', { name: 'toggle' }).click());
    expect(reserved()).toBe(72);

    act(() => screen.getByRole('button', { name: 'toggle' }).click());
    // Closing a still-mounted wrapper detaches the node without unmounting the
    // component, so a cleanup keyed on unmount alone would leak the height.
    expect(reserved()).toBe(0);
  });

  it('releases the reservation when the owner unmounts entirely', () => {
    const { unmount } = render(<Harness />);
    act(() => screen.getByRole('button', { name: 'toggle' }).click());
    expect(reserved()).toBe(72);

    unmount();
    expect(reserved()).toBe(0);
  });

  it('keeps two open panels independent', () => {
    render(
      <>
        <Panel open />
        <Panel open />
      </>
    );
    // Both registered under distinct useId keys; the reservation is the max of
    // the two, not double.
    expect(reserved()).toBe(72);
    expect(Object.keys(useActionBarStore.getState().heights)).toHaveLength(2);
  });
});
