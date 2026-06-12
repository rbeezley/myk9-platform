import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapRowActionsMenu } from '../ShowMapRowActionsMenu';
import { buildShowMapTree } from '../showMapTree';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
} as Show;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

const classes: ShowMapClassInput[] = [
  {
    id: 'class-active',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    status: 'In Progress',
  },
  {
    id: 'class-future',
    trialId: 'trial-1',
    name: 'Exterior Advanced B',
    status: 'Not Started',
  },
];

describe('ShowMapRowActionsMenu', () => {
  it('does not render a row actions trigger for the synthetic All Exhibitors row', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[0]!],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-active',
          dog_id: 'dog-1',
          dog: { id: 'dog-1', call_name: 'Bella' },
          entry_status: 'submitted',
        },
      ],
    });
    const allExhibitorsNode = tree.nodesById['all-exhibitors:show-1'];
    if (!allExhibitorsNode) throw new Error('Expected All Exhibitors node');

    render(<ShowMapRowActionsMenu node={allExhibitorsNode} tree={tree} />);

    expect(screen.queryByRole('button', { name: /actions for all exhibitors/i })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('caps Recommended at two actions and keeps the full list below the separator', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-submitted-a',
          class_id: 'class-active',
          dog: { call_name: 'Bella' },
          entry_status: 'submitted',
        },
        {
          id: 'entry-submitted-b',
          class_id: 'class-future',
          dog: { call_name: 'Scout' },
          entry_status: 'submitted',
        },
      ],
    });
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapRowActionsMenu
        node={tree.root}
        tree={tree}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for spring trial/i }));

    const menu = await screen.findByRole('menu');
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();

    const recommendedItems = Array.from(
      document.body.querySelectorAll('[data-show-map-action-section="recommended"]')
    );
    const allItems = Array.from(
      document.body.querySelectorAll('[data-show-map-action-section="all"]')
    );
    const separator = document.body.querySelector('[role="separator"]');

    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(recommendedItems).toHaveLength(2);
    expect(recommendedItems[0]).toHaveTextContent('Review entry');
    expect(recommendedItems[0]).toHaveTextContent('Entry is waiting for secretary review');
    expect(recommendedItems[1]).toHaveTextContent('Review entry');
    expect(recommendedItems[1]).toHaveTextContent('Entry is waiting for secretary review');
    expect(allItems.length).toBeGreaterThan(recommendedItems.length);
    const lastRecommendedItem = recommendedItems[1];
    const firstAllItem = allItems[0];
    if (!separator || !lastRecommendedItem || !firstAllItem) {
      throw new Error('Expected Recommended items, separator, and full action items');
    }
    expect(separator.compareDocumentPosition(lastRecommendedItem)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING
    );
    expect(separator.compareDocumentPosition(firstAllItem)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps disabled actions out of Recommended but exposes their disabled reason', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[1]!],
      entries: [],
    });
    const classNode = tree.nodesById['class:class-future'];
    if (!classNode) throw new Error('Expected future class node');
    const classWithoutTrial = { ...classNode, parentId: undefined };
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapRowActionsMenu
        node={classWithoutTrial}
        tree={tree}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for exterior advanced b/i }));

    await screen.findByRole('menu');
    const recommendedItems = Array.from(
      document.body.querySelectorAll('[data-show-map-action-section="recommended"]')
    );
    expect(recommendedItems).toHaveLength(1);
    expect(recommendedItems[0]).toHaveTextContent('Mark Class Started');
    expect(recommendedItems[0]).not.toHaveTextContent('Print Check-In Sheet');
    expect(screen.getByText('No destination is available for this action.')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('menuitem', { name: /print check-in sheet/i }));

    expect(onAction).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keeps class row menus scoped to class actions', async () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [classes[1]!],
      entries: [
        {
          id: 'entry-needs-check-in',
          class_id: 'class-future',
          dog: { call_name: 'Scout' },
          check_in_status: 'no-status',
        },
      ],
    });
    const classNode = tree.nodesById['class:class-future'];
    if (!classNode) throw new Error('Expected future class node');

    const { user } = render(<ShowMapRowActionsMenu node={classNode} tree={tree} />);

    await user.click(screen.getByRole('button', { name: /actions for exterior advanced b/i }));

    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem', { name: /mark class started/i }).length).toBeGreaterThan(
      0
    );
    expect(
      screen.getAllByRole('menuitem', { name: /print check-in sheet/i }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('menuitem', { name: /mark checked in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /scratch \/ no-show/i })).not.toBeInTheDocument();
  });

  it('uses the supplied clock for root menu recommendations', async () => {
    const futureTrial = {
      ...trial,
      trialDate: '2026-06-12',
      timezone: 'America/New_York',
    } as SyncableTrial;
    const tree = buildShowMapTree({
      show,
      trials: [futureTrial],
      classes: [
        {
          id: 'class-needs-signature',
          trialId: 'trial-1',
          name: 'Container Novice A',
          status: 'Complete',
        },
        {
          id: 'class-not-started',
          trialId: 'trial-1',
          name: 'Interior Novice B',
          status: 'Not Started',
        },
      ],
      entries: [
        {
          id: 'entry-needs-signature',
          class_id: 'class-needs-signature',
          is_scored: true,
        },
      ],
    });

    const { user } = render(
      <ShowMapRowActionsMenu
        node={tree.root}
        tree={tree}
        scopeNow={new Date('2026-05-28T15:00:00.000Z')}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for spring trial/i }));

    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem', { name: /open schedule/i }).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('menuitem', { name: /collect judge signature/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /mark class started/i })).not.toBeInTheDocument();
  });
});
