import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from '../SecretaryCockpit';
import { resetHonouredAnchorForTests } from '../cockpitAnchorHonoured';
import { FOCUS_MIN_PX, RAIL_PX, RAIL_STEP_PX, SPLIT_GAP_PX } from '../cockpitSplit';
import { RAIL_WIDTH_STORAGE_KEY } from '../useCockpitRailWidth';
import type { SecretaryCockpitSnapshot } from '../secretaryCockpitTypes';

// jsdom has no layout: feed the cockpit the width it would measure.
const cockpit = vi.hoisted(() => ({
  width: 1000 as number | null,
  ref: { current: null as HTMLElement | null },
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: cockpit.ref, width: cockpit.width }),
}));

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  printTrackingInUse: true,
  checklistInUse: true,
  trials: [{ id: 'trial-1', date: '2026-07-20', number: 'Trial 1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 4,
      scoredCount: 0,
      actions: [],
      attention: [],
      paperwork: [],
      entryRows: [],
    },
  ],
};

const WIDTH = 1000;
const MAX = WIDTH - SPLIT_GAP_PX - FOCUS_MIN_PX;

function renderCockpit() {
  const view = render(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />, {
    initialRoute: '/shows/show-1',
  });
  const grid = screen
    .getByTestId('secretary-cockpit')
    .querySelector<HTMLElement>('[data-cockpit-layout]')!;
  return { ...view, columns: () => grid.style.gridTemplateColumns };
}

const divider = () => screen.getByRole('separator', { name: 'Resize schedule and class' });

// MYK9-2142
describe('the divider between the schedule and the selected class', () => {
  beforeEach(() => {
    cockpit.width = WIDTH;
    window.localStorage.removeItem(RAIL_WIDTH_STORAGE_KEY);
    resetHonouredAnchorForTests();
  });
  afterEach(() => {
    window.localStorage.removeItem(RAIL_WIDTH_STORAGE_KEY);
  });

  it('starts at 300px and says its width and limits', () => {
    const { columns } = renderCockpit();
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);
    expect(divider()).toHaveAttribute('aria-orientation', 'vertical');
    expect(divider()).toHaveAttribute('aria-valuenow', String(RAIL_PX));
    expect(divider()).toHaveAttribute('aria-valuemin', String(RAIL_PX));
    expect(divider()).toHaveAttribute('aria-valuemax', String(MAX));
  });

  it('widens and narrows from the keyboard, within its limits, and remembers the width', async () => {
    const { user, columns } = renderCockpit();
    divider().focus();

    await user.keyboard('{ArrowRight}');
    expect(columns()).toBe(`${RAIL_PX + RAIL_STEP_PX}px minmax(0, 1fr)`);
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBe(
      String(RAIL_PX + RAIL_STEP_PX)
    );

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);

    await user.keyboard('{End}');
    expect(columns()).toBe(`${MAX}px minmax(0, 1fr)`);
    await user.keyboard('{ArrowRight}');
    expect(columns()).toBe(`${MAX}px minmax(0, 1fr)`);

    await user.keyboard('{Home}');
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBe(String(RAIL_PX));
  });

  it('follows a drag and stops following when the pointer is released', () => {
    const { columns } = renderCockpit();
    fireEvent.pointerDown(divider(), {
      clientX: 310,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerMove(divider(), { clientX: 410, pointerId: 1, buttons: 1 });
    expect(columns()).toBe('400px minmax(0, 1fr)');
    // Saved once, where the drag ends, not on every move.
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBeNull();
    fireEvent.pointerUp(divider(), { clientX: 410, pointerId: 1 });
    fireEvent.pointerMove(divider(), { clientX: 500, pointerId: 1, buttons: 1 });
    expect(columns()).toBe('400px minmax(0, 1fr)');
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBe('400');
    expect(divider()).toHaveAttribute('aria-valuenow', '400');
  });

  it('ignores the right button, and a press that never moves saves nothing', () => {
    const { columns } = renderCockpit();
    fireEvent.pointerDown(divider(), {
      clientX: 310,
      pointerId: 1,
      isPrimary: true,
      button: 2,
      buttons: 2,
    });
    fireEvent.pointerMove(divider(), { clientX: 410, pointerId: 1, buttons: 2 });
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);

    fireEvent.pointerDown(divider(), {
      clientX: 310,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerUp(divider(), { clientX: 310, pointerId: 1 });
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBeNull();
  });

  it('ends a drag whose button came up where no pointerup reached the page', () => {
    const { columns } = renderCockpit();
    fireEvent.pointerDown(divider(), {
      clientX: 310,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerMove(divider(), { clientX: 410, pointerId: 1, buttons: 1 });
    // No pointerup (a context menu took it); the next move arrives with no button held.
    fireEvent.pointerMove(divider(), { clientX: 520, pointerId: 1, buttons: 0 });
    fireEvent.pointerMove(divider(), { clientX: 560, pointerId: 1, buttons: 0 });
    expect(columns()).toBe('400px minmax(0, 1fr)');
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBe('400');
  });

  it('leaves modified keys alone, so Alt+Left is still the browser Back', async () => {
    const { user, columns } = renderCockpit();
    divider().focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}{Control>}{End}{/Control}{Shift>}{End}{/Shift}');
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);
  });

  it('names the schedule it resizes', () => {
    renderCockpit();
    const controls = divider().getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBe(
      screen.getByRole('region', { name: 'Trial schedule' })
    );
  });

  it('returns to 300px on a double-click', async () => {
    window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '480');
    const { user, columns } = renderCockpit();
    expect(columns()).toBe('480px minmax(0, 1fr)');
    await user.dblClick(divider());
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);
  });

  it('shows a remembered width too wide for this window at the widest that fits, and keeps it', () => {
    window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '900');
    const { columns, rerender } = renderCockpit();
    expect(columns()).toBe(`${MAX}px minmax(0, 1fr)`);
    expect(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY)).toBe('900');

    cockpit.width = 1400;
    rerender(<SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />);
    expect(columns()).toBe('900px minmax(0, 1fr)');
  });

  it.each(['abc', '120', ''])('ignores a remembered width of "%s"', saved => {
    window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, saved);
    const { columns } = renderCockpit();
    expect(columns()).toBe(`${RAIL_PX}px minmax(0, 1fr)`);
  });

  it('is absent when the cockpit is stacked', () => {
    cockpit.width = 700;
    renderCockpit();
    expect(screen.queryByRole('separator', { name: 'Resize schedule and class' })).toBeNull();
  });

  it('is absent when no class is selected', () => {
    render(
      <SecretaryCockpit
        snapshot={{ ...snapshot, classes: [] }}
        canManageShow
        onCommand={vi.fn()}
      />,
      { initialRoute: '/shows/show-1' }
    );
    expect(screen.queryByRole('separator', { name: 'Resize schedule and class' })).toBeNull();
  });
});
