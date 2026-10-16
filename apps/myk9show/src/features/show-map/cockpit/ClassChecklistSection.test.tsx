import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen, within } from '@/test/utils/testUtils';

import { readResultsTabUrlState } from '@/features/results-tab/resultsTabRoutes';
import { ClassChecklistSection } from './ClassChecklistSection';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

describe('ClassChecklistSection after-scoring items (MYK9-1032)', () => {
  const completeClass = fromPartial<SecretaryCockpitClass>({
    id: 'c1',
    trialId: 't1',
    lifecycle: 'complete',
    entryCount: 2,
    scoredCount: 2,
    wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
    registryId: 'AKC',
  });
  const printable = (reportId: string, label: string) => ({
    reportId,
    label,
    state: 'unconfirmed' as const,
    printHref: `/print/${reportId}`,
    confirmation: {
      scope: { kind: 'show' as const, showId: 'show-1' },
      coverage: {},
      fingerprint: 'f',
    },
  });
  const paperwork = [
    printable('check-in-sheet', 'Check-in sheet'),
    printable('scoresheet', 'Score sheets'),
    printable('results-sheet', 'Results'),
    printable('result-labels', 'Result labels'),
  ];

  it('links preliminary results and ribbon labels to the class on Results, as links not actions', () => {
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={completeClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    const items = within(screen.getByRole('region', { name: 'Class checklist' })).getAllByRole(
      'listitem'
    );
    for (const index of [4, 5]) {
      const link = within(items[index]!).getByRole('link');
      const url = new URL(link.getAttribute('href')!, 'https://x.test');
      expect(url.pathname).toBe('/shows/show-1/results');
      expect(url.searchParams.get('classId')).toBe('c1');
      expect(url.searchParams.get('trialId')).toBe('t1');
      // The Results tab itself reads this URL back to the same class.
      expect(readResultsTabUrlState(url.searchParams)).toMatchObject({
        classId: 'c1',
        trialId: 't1',
      });
      expect(within(items[index]!).queryByRole('button')).toBeNull();
    }
  });

  it('links the initials item to the class on Results, with no Undo of its own', () => {
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={{ ...completeClass, wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE }}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    const items = within(screen.getByRole('region', { name: 'Class checklist' })).getAllByRole(
      'listitem'
    );
    const link = within(items[6]!).getByRole('link');
    const url = new URL(link.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/shows/show-1/results');
    expect(url.searchParams.get('classId')).toBe('c1');
    expect(readResultsTabUrlState(url.searchParams)).toMatchObject({
      classId: 'c1',
      trialId: 't1',
    });
    expect(within(items[6]!).queryByRole('button')).toBeNull();
  });

  it('offers print only for check-in and score sheets, never the results sheet or result labels', () => {
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={completeClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    // Print opens beside the page (no link to Reports), and only these two sheets can be ticked.
    const printable = screen.getAllByRole('checkbox').map(box => box.getAttribute('aria-label'));
    expect(printable).toEqual(['Select Check-in sheet to print', 'Select Score sheets to print']);
    expect(screen.getAllByRole('button', { name: 'Print' })).toHaveLength(2);
    const hrefs = screen.queryAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).not.toContain('/print/check-in-sheet');
    expect(screen.queryByText('Other paperwork')).toBeNull();
  });
});

describe('ClassChecklistSection batch print', () => {
  it('ticks several sheets and opens one print panel for them together', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const completeClass = fromPartial<SecretaryCockpitClass>({
      id: 'c1',
      trialId: 't1',
      name: 'Novice Container',
      lifecycle: 'complete',
      entryCount: 2,
      scoredCount: 0,
      registryId: 'AKC',
    });
    const sheet = (reportId: string, label: string) => ({
      reportId,
      label,
      state: 'unconfirmed' as const,
      printHref: `/print/${reportId}`,
    });
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={completeClass}
        paperwork={[sheet('check-in-sheet', 'Check-in sheet'), sheet('scoresheet', 'Score sheets')]}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Print selected/ })).not.toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const box of boxes.slice(0, 2)) await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Print selected (2)' }));
    expect(await screen.findByText('Print selected sheets')).toBeInTheDocument();
    expect(screen.getByText('Novice Container')).toBeInTheDocument();
  });
});

describe('ClassChecklistSection batch print without checklist items', () => {
  it('offers Print selected for a class that has only Other paperwork', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={fromPartial<SecretaryCockpitClass>({
          id: 'c1',
          trialId: 't1',
          name: 'Novice Container',
          lifecycle: 'cancelled',
          registryId: 'AKC',
        })}
        paperwork={[
          {
            reportId: 'armband-labels',
            label: 'Armband labels',
            state: 'unconfirmed',
            printHref: '/print/armband-labels',
          },
        ]}
        timeZone="America/New_York"
        onCommand={vi.fn()}
      />
    );
    expect(screen.queryByRole('region', { name: 'Class checklist' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Armband labels to print' }));
    expect(screen.getByRole('button', { name: 'Print selected (1)' })).toBeInTheDocument();
  });
});
