import { describe, expect, it, vi } from 'vitest';
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
    expect(within(region).getAllByRole('listitem')).toHaveLength(7);
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
    ['Check-in sheet', 'Print Check-in sheet'],
    ['Score sheets', 'Print Score sheets'],
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
      paperwork: [{ ...printable[0]!, state: 'stale' }, sheet('scoresheet', 'Score sheets')],
    });
    expect(
      screen.getByRole('button', { name: 'Check-in sheet, needs reprint. Open print preview' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Score sheets/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'Score sheets, not done' })).toBeInTheDocument();
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
