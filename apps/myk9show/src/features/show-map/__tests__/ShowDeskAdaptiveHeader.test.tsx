import { describe, expect, it, vi } from 'vitest';
import { ListTree } from 'lucide-react';
import { render } from '@/test/utils/testUtils';
import { ShowDeskAdaptiveHeader } from '../ShowDeskAdaptiveHeader';
import type { ShowMapAction } from '../showMapActions';
import type { ShowDeskShowStatus } from '../showDeskStatus';

function makeAction(overrides: Partial<ShowMapAction> = {}): ShowMapAction {
  return {
    id: 'score-class',
    nodeId: 'class:class-1',
    label: 'Score class',
    why: 'Class is in progress',
    priority: 70,
    icon: ListTree,
    href: '/scoring/classes/class-1/entries?mode=split',
    ...overrides,
  } as ShowMapAction;
}

const baseProps = {
  showStatus: 'show-in-progress' as ShowDeskShowStatus,
  statusSummary: '3 of 5 classes complete · 2 entries need attention',
  guidanceAction: undefined,
  upNextActions: [],
  runningNow: [],
  pendingSignals: [],
  onStartAction: vi.fn(),
  onDismissGuidance: vi.fn(),
  onSelectRunning: vi.fn(),
};

describe('ShowDeskAdaptiveHeader', () => {
  it.each([
    ['setup', 'Setup'],
    ['show-in-progress', 'Show in progress'],
    ['wrap-up', 'Wrap-up'],
    ['closed', 'Closed'],
  ] as const)('renders status pill for %s', (status, label) => {
    const { getByTestId } = render(
      <ShowDeskAdaptiveHeader {...baseProps} showStatus={status} />
    );
    expect(getByTestId('show-desk-status-pill').textContent).toBe(label);
  });

  it('omits the guidance card when no guidance action is provided', () => {
    const { container } = render(<ShowDeskAdaptiveHeader {...baseProps} />);
    expect(container.querySelector('[aria-label="Next best action"]')).toBeNull();
  });

  it('renders the guidance card and invokes onStartAction when start is clicked', async () => {
    const guidanceAction = makeAction({ id: 'review-entry', label: 'Review entry #101' });
    const onStartAction = vi.fn();
    const { user, getByRole } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        guidanceAction={guidanceAction}
        onStartAction={onStartAction}
      />
    );
    await user.click(getByRole('button', { name: /start/i }));
    expect(onStartAction).toHaveBeenCalledWith(guidanceAction);
  });

  it('renders all three up-next actions with Open buttons', () => {
    const actions = [
      makeAction({ id: 'score-class', nodeId: 'class:a', label: 'Score class A' }),
      makeAction({ id: 'mark-checked-in', nodeId: 'entry:b', label: 'Check in entry B' }),
      makeAction({ id: 'message-handler', nodeId: 'entry:c', label: 'Message handler C' }),
    ];
    const { getAllByRole, getByText } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextActions={actions} />
    );
    expect(getByText('Score class A')).toBeInTheDocument();
    expect(getByText('Check in entry B')).toBeInTheDocument();
    expect(getByText('Message handler C')).toBeInTheDocument();
    const openButtons = getAllByRole('button', { name: /open/i });
    expect(openButtons).toHaveLength(3);
  });

  it('caps up-next at three even when more actions are supplied', () => {
    const actions = Array.from({ length: 5 }, (_, i) =>
      makeAction({ id: 'score-class', nodeId: `class:${i}`, label: `Action ${i}` })
    );
    const { getAllByRole } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextActions={actions} />
    );
    expect(getAllByRole('button', { name: /open/i })).toHaveLength(3);
  });

  it('renders no pending signals row when the list is empty', () => {
    const { queryByTestId } = render(<ShowDeskAdaptiveHeader {...baseProps} />);
    expect(queryByTestId('show-desk-pending-signals')).toBeNull();
  });

  it('renders a chip per pending signal with its label', () => {
    const signals = [
      {
        id: 'entries-waiting-review' as const,
        count: 5,
        priority: 'highest' as const,
        label: '5 entries waiting for review',
      },
      {
        id: 'entries-waiting-checkin' as const,
        count: 2,
        priority: 'high' as const,
        label: '2 entries waiting for check-in',
      },
      {
        id: 'classes-needing-signature' as const,
        count: 1,
        priority: 'high' as const,
        label: '1 class needs judge signature',
      },
    ];
    const { getByText, getByTestId } = render(
      <ShowDeskAdaptiveHeader {...baseProps} pendingSignals={signals} />
    );
    const row = getByTestId('show-desk-pending-signals');
    expect(row.querySelectorAll('[data-signal-id]')).toHaveLength(3);
    expect(getByText('5 entries waiting for review')).toBeInTheDocument();
    expect(getByText('2 entries waiting for check-in')).toBeInTheDocument();
    expect(getByText('1 class needs judge signature')).toBeInTheDocument();
  });

  it('invokes onSelectPendingSignal when a chip is clicked', async () => {
    const onSelectPendingSignal = vi.fn();
    const signals = [
      {
        id: 'entries-waiting-review' as const,
        count: 5,
        priority: 'highest' as const,
        label: '5 entries waiting for review',
      },
    ];
    const { user, getByText } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        pendingSignals={signals}
        onSelectPendingSignal={onSelectPendingSignal}
      />
    );
    await user.click(getByText('5 entries waiting for review'));
    expect(onSelectPendingSignal).toHaveBeenCalledWith('entries-waiting-review');
  });

  it('renders running now items and invokes onSelectRunning', async () => {
    const onSelectRunning = vi.fn();
    const runningNow = [
      {
        nodeId: 'class:class-1',
        label: 'Container Novice',
        ringLabel: 'Ring 1',
        progressLabel: '12/20 scored',
        percentScored: 60,
      },
    ];
    const { user, getByText } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        runningNow={runningNow}
        onSelectRunning={onSelectRunning}
      />
    );
    await user.click(getByText('Container Novice'));
    expect(onSelectRunning).toHaveBeenCalledWith('class:class-1');
  });
});
