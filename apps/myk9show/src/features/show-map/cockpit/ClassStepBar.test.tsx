import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';

import { render, screen, waitFor, within } from '@/test/utils/testUtils';

import { ClassChecklistSection } from './ClassChecklistSection';
import type { SecretaryCockpitClass, SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn(async () => 'mutation-1') },
  replicatedPaperworkPrintsTable: { confirmPrinted: vi.fn(), voidPrint: vi.fn() },
}));

const sourceClass = fromPartial<SecretaryCockpitClass>({
  id: 'c1',
  trialId: 't1',
  name: 'Novice Container',
  lifecycle: 'in-progress',
  entryCount: 4,
  scoredCount: 1,
  registryId: 'AKC',
});
const sheet = (reportId: string, label: string, printHref?: string): SecretaryCockpitPaperwork => ({
  reportId,
  label,
  state: 'unconfirmed',
  ...(printHref ? { printHref } : {}),
});
const printable = [
  sheet('check-in-sheet', 'Check-in sheet', '/print/check-in-sheet'),
  sheet('scoresheet', 'Score sheets', '/print/scoresheet'),
  sheet('results-sheet', 'Results', '/print/results-sheet'),
  sheet('result-labels', 'Result labels', '/print/result-labels'),
];

function sectionFor(
  source: SecretaryCockpitClass,
  options: { paperwork?: SecretaryCockpitPaperwork[]; canManageShow?: boolean } = {}
) {
  return (
    <ClassChecklistSection
      showId="show-1"
      sourceClass={source}
      paperwork={options.paperwork ?? printable}
      timeZone="America/New_York"
      onCommand={vi.fn()}
      printTrackingInUse={false}
      canManageShow={options.canManageShow ?? true}
      trialDate="2026-07-20"
    />
  );
}

function renderBar(
  options: {
    paperwork?: SecretaryCockpitPaperwork[];
    canManageShow?: boolean;
    source?: SecretaryCockpitClass;
  } = {}
) {
  return render(sectionFor(options.source ?? sourceClass, options));
}

describe('class step bar (MYK9-1783)', () => {
  it('is expanded with the count even when the show has not used the checklist', () => {
    renderBar();
    const region = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(6);
    expect(within(region).getByText('1 of 7 done')).toBeVisible();
    expect(document.querySelector('details[data-testid="class-checklist-disclosure"]')).toBeNull();
  });

  it('adds the unknown count when states are unknown', () => {
    renderBar({
      paperwork: [],
      source: fromPartial<SecretaryCockpitClass>({ id: 'c1', trialId: 't1' }),
    });
    expect(screen.getByText(/0 of 7 done · 7 unknown/)).toBeVisible();
  });

  it.each([
    ['Preliminary results', 'Print Preliminary results'],
    ['Result labels', 'Print Result labels'],
  ])('%s opens the print preview for that one report', async (label, title) => {
    const { user } = renderBar();
    await user.click(
      screen.getByRole('button', { name: new RegExp(`^${label}, .*Open print preview`) })
    );
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByText('Print selected sheets')).toBeNull();
  });

  it('Class started opens the start editor for a manager', async () => {
    const { user } = renderBar();
    expect(screen.queryByLabelText('Start time for Novice Container')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Class started, done\. Set start time/ }));
    expect(screen.getByLabelText('Start time for Novice Container')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Start time for Novice Container')).toBeNull();
  });

  it('moves focus into the time field on open and back to the step on close', async () => {
    const { user } = renderBar();
    const step = screen.getByRole('button', { name: /^Class started, done\. Set start time/ });
    await user.click(step);
    expect(screen.getByLabelText('Start time for Novice Container')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(step).toHaveFocus();
  });

  it('returns focus to the step after a save', async () => {
    const { user } = renderBar();
    const step = screen.getByRole('button', { name: /^Class started, done\. Set start time/ });
    await user.click(step);
    await user.type(screen.getByLabelText('Start time for Novice Container'), '9:42 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Start time for Novice Container')).toBeNull()
    );
    expect(step).toHaveFocus();
  });

  it('reaches Clear start from the open form whether or not the step is done', async () => {
    const { user } = renderBar({
      source: { ...sourceClass, actualStart: '2026-07-20T14:00:00.000Z' },
    });
    await user.click(screen.getByRole('button', { name: /^Class started, done\. Set start time/ }));
    expect(
      screen.getByRole('button', { name: 'Clear start time for Novice Container' })
    ).toBeInTheDocument();
  });

  it('does not reopen the editor when returning to a class', async () => {
    const { user, rerender } = renderBar();
    await user.click(screen.getByRole('button', { name: /^Class started, done\. Set start time/ }));
    rerender(sectionFor({ ...sourceClass, id: 'c2', name: 'Other Class' }));
    expect(screen.queryByLabelText(/^Start time for/)).toBeNull();
    rerender(sectionFor(sourceClass));
    expect(screen.queryByLabelText('Start time for Novice Container')).toBeNull();
  });

  it('marks only the next step with a visible Next cue, outside the accessible name', () => {
    renderBar();
    const region = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(region).getAllByText('Next')).toHaveLength(1);
    const next = region.querySelector('[aria-current="step"]')!;
    expect(within(next as HTMLElement).getByText('Next')).toBeVisible();
    expect(next.getAttribute('aria-label')).not.toMatch(/Next/);
  });

  it('shows Class started as plain status to someone who cannot manage the show', () => {
    renderBar({ canManageShow: false });
    expect(screen.queryByRole('button', { name: /^Class started/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Class started, done' })).toBeInTheDocument();
  });

  it('Scoring complete links to paper scoring and returns to this class', () => {
    renderBar();
    const link = screen.getByRole('link', { name: /^Scoring complete, not done, 1 of 4 scored/ });
    const url = new URL(link.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/scoring/classes/c1/entries');
    const back = new URL(url.searchParams.get('returnTo')!, 'https://x.test');
    expect(back.searchParams.toString()).toContain('c1');
  });

  it('the Judge signature step links to the class on Results', () => {
    renderBar();
    const link = screen.getByRole('link', { name: /Open on Results$/ });
    const url = new URL(link.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/shows/show-1/results');
    expect(url.searchParams.get('classId')).toBe('c1');
    expect(url.searchParams.get('trialId')).toBe('t1');
  });

  it('names each openable step by label, state and action, and keeps a not-openable step as status', () => {
    renderBar({
      paperwork: [{ ...printable[2]!, state: 'stale' }],
    });
    expect(
      screen.getByRole('button', { name: 'Preliminary results, needs reprint. Open print preview' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Result labels/ })).toBeNull();
    expect(
      screen.getByRole('group', { name: 'Result labels, not done, Nothing to print yet' })
    ).toBeInTheDocument();
  });

  it('gives every step card the same fixed height and clips long text to one line', () => {
    renderBar();
    const cards = screen.getAllByRole('listitem').map(li => li.firstElementChild as HTMLElement);
    expect(cards).toHaveLength(6);
    expect(screen.getAllByRole('listitem')[0]!.closest('ol')).toHaveClass(
      'grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]'
    );
    for (const card of cards) {
      expect(card).toHaveClass('h-[8.25rem]', 'overflow-hidden');
      expect(card.querySelector('.line-clamp-2')).not.toBeNull();
    }
  });

  describe('Print paperwork card', () => {
    const armband = (state: SecretaryCockpitPaperwork['state'] = 'unconfirmed') => ({
      ...sheet('armband-labels', 'Armband labels', '/print/armband-labels'),
      state,
    });
    const withState = (
      state: SecretaryCockpitPaperwork['state'],
      ...ids: string[]
    ): SecretaryCockpitPaperwork[] =>
      printable.map(row => (ids.includes(row.reportId) ? { ...row, state } : row));
    const card = (name: RegExp) => screen.getByRole('button', { name });
    const records = () => document.querySelector('details') as HTMLDetailsElement;

    it('is one card in the first sheet position naming its documents; the count stays x of 7', () => {
      renderBar({ paperwork: [armband(), ...printable] });
      const region = screen.getByRole('region', { name: 'Class checklist' });
      const first = within(region).getAllByRole('listitem')[0]!;
      expect(
        within(first).getByRole('button', {
          name: 'Print paperwork: armband labels, check-in sheet, score sheets. Not done, 0 of 3 printed. Show print records',
        })
      ).toBeInTheDocument();
      expect(within(first).getAllByRole('button')).toHaveLength(1);
      expect(within(region).getByText('1 of 7 done')).toBeVisible();
    });

    it('counts only the documents this class has', () => {
      renderBar();
      expect(
        card(/^Print paperwork: check-in sheet, score sheets\. Not done, 0 of 2 printed/)
      ).toBeVisible();
    });

    it('is done when everything is printed, partial when some is, and reprint when any is stale', () => {
      const { unmount } = renderBar({
        paperwork: [armband('current'), ...withState('current', 'check-in-sheet')],
      });
      expect(card(/2 of 3 printed/)).toBeVisible();
      unmount();
      const all = renderBar({
        paperwork: [armband('current'), ...withState('current', 'check-in-sheet', 'scoresheet')],
      });
      expect(card(/3 of 3 printed/)).toHaveClass('bg-success/10');
      all.unmount();
      renderBar({ paperwork: [armband('current'), ...withState('stale', 'scoresheet')] });
      expect(card(/1 of 3 printed/)).toHaveClass('bg-warning/10');
    });

    it('says its state in the name for every state, and never shows unknown as not printed', () => {
      const unknown = (reportId: string, label: string) => ({
        ...sheet(reportId, label, `/print/${reportId}`),
        state: 'unknown' as const,
      });
      const named = (paperwork: SecretaryCockpitPaperwork[]) => {
        const view = renderBar({ paperwork });
        const name = screen
          .getByRole('button', { name: /^Print paperwork/ })
          .getAttribute('aria-label');
        view.unmount();
        return name;
      };
      const [checkIn, scores] = [printable[0]!, printable[1]!];
      expect(named([checkIn, scores])).toBe(
        'Print paperwork: check-in sheet, score sheets. Not done, 0 of 2 printed. Show print records'
      );
      expect(
        named([
          { ...checkIn, state: 'current' },
          { ...scores, state: 'current' },
        ])
      ).toBe(
        'Print paperwork: check-in sheet, score sheets. Done, 2 of 2 printed. Show print records'
      );
      expect(named([{ ...checkIn, state: 'stale' }, scores])).toBe(
        'Print paperwork: check-in sheet, score sheets. Needs reprint, 0 of 2 printed. Show print records'
      );
      const allUnknown = [
        unknown('check-in-sheet', 'Check-in sheet'),
        unknown('scoresheet', 'Score sheets'),
      ];
      expect(named(allUnknown)).toBe(
        'Print paperwork: check-in sheet, score sheets. Print status unknown. Show print records'
      );
      // Mixed known and unknown is still unknown.
      expect(named([{ ...checkIn, state: 'current' }, allUnknown[1]!])).toBe(
        'Print paperwork: check-in sheet, score sheets. Print status unknown. Show print records'
      );
      // A reprint outranks unknown.
      expect(named([{ ...checkIn, state: 'stale' }, allUnknown[1]!])).toContain('Needs reprint');
    });

    it('reports expanded state and controls the records element', async () => {
      const { user } = renderBar({ paperwork: [armband(), ...printable] });
      const button = card(/^Print paperwork/);
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button.getAttribute('aria-controls')).toBe(records().id);
      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('scrolls the opened records into view on every press', async () => {
      const scroll = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scroll;
      onTestFinished(() => {
        Element.prototype.scrollIntoView = original;
      });
      const { user } = renderBar({ paperwork: [armband(), ...printable] });
      await user.click(card(/^Print paperwork/));
      await user.click(card(/^Print paperwork/));
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
      expect(scroll.mock.contexts[0]).toBe(records());
    });

    it('opens the print records and focuses their summary, without opening a print', async () => {
      const { user } = renderBar({ paperwork: [armband(), ...printable] });
      expect(records().open).toBe(false);
      await user.click(card(/^Print paperwork/));
      expect(records().open).toBe(true);
      expect(records().querySelector('summary')).toHaveFocus();
      expect(screen.queryByText(/^Print (Armband|Check-in|Score)/)).toBeNull();
      expect(screen.queryByText('Print selected sheets')).toBeNull();
      await user.click(records().querySelector('summary')!);
      expect(records().open).toBe(false);
    });

    it('lists armband labels, check-in sheet and score sheets first and together', async () => {
      const { user } = renderBar({ paperwork: [armband(), ...printable] });
      await user.click(card(/^Print paperwork/));
      const ticks = within(records())
        .getAllByRole('checkbox')
        .map(box => box.getAttribute('aria-label'));
      expect(ticks.slice(0, 3)).toEqual([
        'Select Armband labels to print',
        'Select Check-in sheet to print',
        'Select Score sheets to print',
      ]);
      expect(ticks).toHaveLength(3);
      // The armband labels are printable from the revealed record.
      await user.click(screen.getByRole('checkbox', { name: 'Select Armband labels to print' }));
      await user.click(screen.getByRole('button', { name: 'Print selected (1)' }));
      expect(await screen.findByText('Print Armband labels')).toBeInTheDocument();
    });

    it('carries the Next marker when it is the first step not done', () => {
      renderBar({ paperwork: [armband(), ...printable] });
      const next = card(/^Print paperwork/);
      expect(next).toHaveAttribute('aria-current', 'step');
      expect(within(next).getByText('Next')).toBeVisible();
    });

    it('closes again on a class change', async () => {
      const { user, rerender } = renderBar({ paperwork: [armband(), ...printable] });
      await user.click(card(/^Print paperwork/));
      expect(records().open).toBe(true);
      rerender(
        sectionFor(
          { ...sourceClass, id: 'c2', name: 'Other Class' },
          {
            paperwork: [armband(), ...printable],
          }
        )
      );
      expect(records().open).toBe(false);
      rerender(sectionFor(sourceClass, { paperwork: [armband(), ...printable] }));
      expect(records().open).toBe(false);
    });

    it('is plain status, not a button, when the class has none of the documents', () => {
      renderBar({ paperwork: [] });
      expect(screen.queryByRole('button', { name: /^Print paperwork/ })).toBeNull();
      expect(
        screen.getByRole('group', { name: 'Print paperwork, not done, Nothing to print yet' })
      ).toBeInTheDocument();
    });
  });

  it('keeps Other paperwork reachable under the bar, with its ticks and Print selected', async () => {
    const { user } = renderBar({
      paperwork: [...printable, sheet('armband-labels', 'Armband labels', '/print/armband-labels')],
    });
    await user.click(screen.getByText('Other paperwork and print records (3)'));
    await user.click(screen.getByRole('checkbox', { name: 'Select Armband labels to print' }));
    await user.click(screen.getByRole('button', { name: 'Print selected (1)' }));
    expect(await screen.findByText('Print Armband labels')).toBeInTheDocument();
  });
});
