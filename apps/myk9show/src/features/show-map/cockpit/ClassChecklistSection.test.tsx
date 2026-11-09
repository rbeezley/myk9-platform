import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen } from '@/test/utils/testUtils';

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

  const renderSection = (sourceClass: SecretaryCockpitClass) =>
    render(
      <ClassChecklistSection
        showId="show-1"
        sourceClass={sourceClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        printTrackingInUse
        canManageShow
        trialDate="2026-07-20"
      />
    );

  it('offers one Continue on Results handoff for a complete class, beside the Judge signature step (MYK9-1319, MYK9-1783)', () => {
    renderSection(completeClass);
    const link = screen.getByRole('link', { name: 'Continue on Results' });
    const url = new URL(link.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/shows/show-1/results');
    expect(url.searchParams.get('classId')).toBe('c1');
    expect(url.searchParams.get('trialId')).toBe('t1');
    // The Results tab itself reads this URL back to the same class.
    expect(readResultsTabUrlState(url.searchParams)).toMatchObject({
      classId: 'c1',
      trialId: 't1',
    });
    const signature = screen.getByRole('link', { name: /Open on Results$/ });
    expect(signature.getAttribute('href')).toBe(link.getAttribute('href'));
  });

  it('has no link into Results for a class that is not complete', () => {
    renderSection({ ...completeClass, lifecycle: 'in-progress', wrapUpStatus: null });
    expect(screen.queryByRole('link', { name: 'Continue on Results' })).toBeNull();
    // Only the Judge signature step reaches Results.
    expect(
      screen
        .queryAllByRole('link')
        .filter(link => (link.getAttribute('href') ?? '').includes('/results'))
    ).toHaveLength(1);
  });

  it('opens print from all four sheet steps, but ticks only the check-in and score sheet records', async () => {
    const { user } = renderSection(completeClass);
    expect(screen.getAllByRole('button', { name: /Open print preview$/ })).toHaveLength(4);
    await user.click(screen.getByText('Print records'));
    const ticks = screen.getAllByRole('checkbox').map(box => box.getAttribute('aria-label'));
    expect(ticks).toEqual(['Select Check-in sheet to print', 'Select Score sheets to print']);
    const hrefs = screen.queryAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).not.toContain('/print/check-in-sheet');
    expect(screen.queryByText(/Other paperwork/)).toBeNull();
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
        printTrackingInUse
        canManageShow
        trialDate="2026-07-20"
      />
    );
    expect(screen.queryByRole('button', { name: /Print selected/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Print records'));
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const box of boxes.slice(0, 2)) await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: 'Print selected (2)' }));
    expect(await screen.findByText('Print selected sheets')).toBeInTheDocument();
    expect(screen.getByText('Novice Container')).toBeInTheDocument();
  });

  it('drops the selection when the focused class changes, so it never prints another class', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const classOf = (id: string, name: string) =>
      fromPartial<SecretaryCockpitClass>({
        id,
        trialId: 't1',
        name,
        lifecycle: 'complete',
        entryCount: 2,
        scoredCount: 0,
        registryId: 'AKC',
      });
    const paperwork = [
      {
        reportId: 'check-in-sheet',
        label: 'Check-in sheet',
        state: 'unconfirmed' as const,
        printHref: '/print/check-in-sheet',
      },
    ];
    const section = (sourceClass: SecretaryCockpitClass) => (
      <ClassChecklistSection
        showId="show-1"
        sourceClass={sourceClass}
        paperwork={paperwork}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        printTrackingInUse
        canManageShow
        trialDate="2026-07-20"
      />
    );
    // Desktop keeps this section mounted while the focused class changes.
    const { rerender } = render(section(classOf('c1', 'Novice Container')));
    await userEvent.click(screen.getByText('Print records'));
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByRole('button', { name: 'Print selected (1)' })).toBeInTheDocument();

    rerender(section(classOf('c2', 'Advanced Interior')));
    expect(screen.queryByRole('button', { name: /Print selected/ })).not.toBeInTheDocument();
    // The disclosure is still open on the next class; none of its ticks carried over.
    for (const box of screen.queryAllByRole('checkbox')) expect(box).not.toBeChecked();

    // Going back does not resurrect the old ticks either: they belonged to that visit.
    rerender(section(classOf('c1', 'Novice Container')));
    expect(screen.queryByRole('button', { name: /Print selected/ })).not.toBeInTheDocument();
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
        printTrackingInUse
        canManageShow
        trialDate="2026-07-20"
      />
    );
    expect(screen.queryByRole('region', { name: 'Class checklist' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Other paperwork (1)'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Armband labels to print' }));
    expect(screen.getByRole('button', { name: 'Print selected (1)' })).toBeInTheDocument();
  });
});
