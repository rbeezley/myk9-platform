import { describe, expect, it, vi } from 'vitest';
import { ListTree } from 'lucide-react';
import { render } from '@/test/utils/testUtils';
import { ShowDeskAdaptiveHeader } from '../ShowDeskAdaptiveHeader';
import type { ShowMapAction } from '../showMapActions';
import type { ShowMapActionGroup } from '../showMapActionGroups';
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

function singleGroup(action: ShowMapAction): ShowMapActionGroup {
  return {
    key: `${action.id}:node:${action.nodeId}`,
    representative: action,
    count: 1,
    items: [{ action }],
  };
}

function multiGroup(
  key: string,
  items: { action: ShowMapAction; disambiguator?: string }[]
): ShowMapActionGroup {
  return {
    key,
    representative: items[0].action,
    count: items.length,
    items,
  };
}

const baseProps = {
  showStatus: 'show-in-progress' as ShowDeskShowStatus,
  statusSummary: '3 of 5 classes complete · 2 entries need attention',
  guidanceAction: undefined,
  upNextGroups: [] as readonly ShowMapActionGroup[],
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

  it('renders single-item up-next groups with Open buttons', () => {
    const groups = [
      singleGroup(makeAction({ id: 'score-class', nodeId: 'class:a', label: 'Score class A' })),
      singleGroup(
        makeAction({ id: 'mark-checked-in', nodeId: 'entry:b', label: 'Check in entry B' })
      ),
      singleGroup(
        makeAction({ id: 'message-handler', nodeId: 'entry:c', label: 'Message handler C' })
      ),
    ];
    const { getAllByRole, getByText } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextGroups={groups} />
    );
    expect(getByText('Score class A')).toBeInTheDocument();
    expect(getByText('Check in entry B')).toBeInTheDocument();
    expect(getByText('Message handler C')).toBeInTheDocument();
    const openButtons = getAllByRole('button', { name: /open/i });
    expect(openButtons).toHaveLength(3);
  });

  it('caps up-next at three groups even when more are supplied', () => {
    const groups = Array.from({ length: 5 }, (_, i) =>
      singleGroup(makeAction({ id: 'score-class', nodeId: `class:${i}`, label: `Action ${i}` }))
    );
    const { getAllByRole } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextGroups={groups} />
    );
    expect(getAllByRole('button', { name: /open/i })).toHaveLength(3);
  });

  it('renders a count badge and collapses by default for multi-item groups', () => {
    const action = (cls: string) =>
      makeAction({
        id: 'review-entry',
        nodeId: `entry:bravo-${cls}`,
        label: 'Review entry',
        why: '#100 · Bravo · Test Secretary — Entry is waiting for secretary review',
      });
    const group = multiGroup('review-entry:dog:dog-bravo', [
      { action: action('a'), disambiguator: 'Container Novice' },
      { action: action('b'), disambiguator: 'Interior Novice' },
      { action: action('c'), disambiguator: 'Exterior Novice' },
    ]);

    const { getByTestId, queryByTestId, getByText, queryByText } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextGroups={[group]} />
    );

    // Count badge shows ×3.
    expect(getByTestId('up-next-group-count').textContent).toBe('×3');
    // Context appears on the summary line.
    expect(
      getByText(/#100 · Bravo · Test Secretary — across 3 classes/)
    ).toBeInTheDocument();
    // Children are collapsed: no class-label disambiguators visible yet.
    expect(queryByText('Container Novice')).toBeNull();
    expect(queryByText('Interior Novice')).toBeNull();
    expect(queryByText('Exterior Novice')).toBeNull();
    expect(queryByTestId('up-next-group-children')).toBeNull();
  });

  it('expands a multi-item group when the chevron is clicked and shows per-class child rows', async () => {
    const action = (cls: string) =>
      makeAction({
        id: 'review-entry',
        nodeId: `entry:bravo-${cls}`,
        label: 'Review entry',
        why: '#100 · Bravo · Test Secretary — Entry is waiting for secretary review',
      });
    const group = multiGroup('review-entry:dog:dog-bravo', [
      { action: action('a'), disambiguator: 'Container Novice' },
      { action: action('b'), disambiguator: 'Interior Novice' },
      { action: action('c'), disambiguator: 'Exterior Novice' },
    ]);

    const { user, getByRole, getByText, getAllByRole, getByTestId } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextGroups={[group]} />
    );

    const toggle = getByRole('button', { name: /Review entry/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(getByText('Container Novice')).toBeInTheDocument();
    expect(getByText('Interior Novice')).toBeInTheDocument();
    expect(getByText('Exterior Novice')).toBeInTheDocument();
    expect(getByTestId('up-next-group-children')).toBeInTheDocument();

    // Each child has its own Open button.
    expect(getAllByRole('button', { name: /open/i })).toHaveLength(3);
  });

  it('invokes onStartAction with the specific child action when its Open is clicked', async () => {
    const onStartAction = vi.fn();
    const bravoA = makeAction({
      id: 'review-entry',
      nodeId: 'entry:bravo-a',
      label: 'Review entry',
      why: '#100 · Bravo — issue',
    });
    const bravoB = makeAction({
      id: 'review-entry',
      nodeId: 'entry:bravo-b',
      label: 'Review entry',
      why: '#100 · Bravo — issue',
    });
    const group = multiGroup('review-entry:dog:dog-bravo', [
      { action: bravoA, disambiguator: 'Container Novice' },
      { action: bravoB, disambiguator: 'Interior Novice' },
    ]);

    const { user, getByRole, getAllByRole } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        upNextGroups={[group]}
        onStartAction={onStartAction}
      />
    );

    await user.click(getByRole('button', { name: /Review entry/i }));
    const openButtons = getAllByRole('button', { name: /open/i });
    expect(openButtons).toHaveLength(2);
    await user.click(openButtons[1]);
    expect(onStartAction).toHaveBeenCalledWith(bravoB);
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

  it('renders pending-signal chips with a 44px-min touch target (INTENT.md)', () => {
    // Regression: chips started life as px-3 py-1 text-xs which is well under the
    // 44x44px minimum from docs/INTENT.md. They are filter shortcuts and need to be
    // tappable on tablet before B2 mounts them.
    const signals = [
      {
        id: 'entries-waiting-review' as const,
        count: 1,
        priority: 'highest' as const,
        label: '1 entry waiting for review',
      },
    ];
    const onSelectPendingSignal = vi.fn();
    const { container } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        pendingSignals={signals}
        onSelectPendingSignal={onSelectPendingSignal}
      />
    );
    const chip = container.querySelector('button[data-signal-id="entries-waiting-review"]');
    expect(chip).not.toBeNull();
    expect(chip?.className).toContain('min-h-[44px]');
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

  it('renders Review queue button when reviewQueueCount > 0 and onOpenReviewQueue is provided', () => {
    const onOpenReviewQueue = vi.fn();
    const { getByTestId } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        onOpenReviewQueue={onOpenReviewQueue}
        reviewQueueCount={42}
      />
    );
    const button = getByTestId('open-review-queue');
    expect(button.textContent).toContain('Review queue (42)');
  });

  it('does not render Review queue button when reviewQueueCount is 0', () => {
    const { queryByTestId } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        onOpenReviewQueue={vi.fn()}
        reviewQueueCount={0}
      />
    );
    expect(queryByTestId('open-review-queue')).toBeNull();
  });

  it('invokes onOpenReviewQueue when the Review queue button is clicked', async () => {
    const onOpenReviewQueue = vi.fn();
    const { user, getByTestId } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        onOpenReviewQueue={onOpenReviewQueue}
        reviewQueueCount={5}
      />
    );
    await user.click(getByTestId('open-review-queue'));
    expect(onOpenReviewQueue).toHaveBeenCalledTimes(1);
  });

  it('renders "Approve all N" button on expanded multi-item review-entry groups', async () => {
    const onBulkApproveGroup = vi.fn();
    const action = (cls: string) =>
      makeAction({
        id: 'review-entry',
        nodeId: `entry:bravo-${cls}`,
        label: 'Review entry',
        why: '#100 · Bravo · Test Secretary — Entry is waiting for secretary review',
      });
    const group = multiGroup('review-entry:dog:dog-bravo', [
      { action: action('a'), disambiguator: 'Container Novice' },
      { action: action('b'), disambiguator: 'Interior Novice' },
      { action: action('c'), disambiguator: 'Exterior Novice' },
    ]);

    const { user, getByRole, queryByTestId, getByTestId } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        upNextGroups={[group]}
        onBulkApproveGroup={onBulkApproveGroup}
      />
    );

    // Collapsed by default — bulk approve button is hidden.
    expect(queryByTestId('up-next-group-bulk-approve')).toBeNull();

    // Expand the group.
    await user.click(getByRole('button', { name: /Review entry/i }));

    const banner = getByTestId('up-next-group-bulk-approve');
    expect(banner.textContent).toContain('Approve all 3');
    await user.click(banner.querySelector('button')!);
    expect(onBulkApproveGroup).toHaveBeenCalledWith(group);
  });

  it('does not render the bulk-approve banner when onBulkApproveGroup is not provided', async () => {
    const action = (cls: string) =>
      makeAction({ id: 'review-entry', nodeId: `entry:bravo-${cls}`, label: 'Review entry' });
    const group = multiGroup('review-entry:dog:dog-bravo', [
      { action: action('a'), disambiguator: 'A' },
      { action: action('b'), disambiguator: 'B' },
    ]);

    const { user, getByRole, queryByTestId } = render(
      <ShowDeskAdaptiveHeader {...baseProps} upNextGroups={[group]} />
    );
    await user.click(getByRole('button', { name: /Review entry/i }));
    expect(queryByTestId('up-next-group-bulk-approve')).toBeNull();
  });

  it('does not render the bulk-approve banner for non-review-entry groups even when expanded', async () => {
    const action = (i: number) =>
      makeAction({
        id: 'mark-checked-in',
        nodeId: `entry:checkin-${i}`,
        label: 'Mark checked in',
      });
    const group = multiGroup('mark-checked-in:dog:dog-x', [
      { action: action(0), disambiguator: 'A' },
      { action: action(1), disambiguator: 'B' },
    ]);

    const { user, getByRole, queryByTestId } = render(
      <ShowDeskAdaptiveHeader
        {...baseProps}
        upNextGroups={[group]}
        onBulkApproveGroup={vi.fn()}
      />
    );
    await user.click(getByRole('button', { name: /Mark checked in/i }));
    expect(queryByTestId('up-next-group-bulk-approve')).toBeNull();
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
