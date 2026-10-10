import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrialSecretaryAccessProvider } from '@/features/actions/TrialSecretaryAccessContext';
import { render } from '@/test/utils/testUtils';

import { buildPaperScoringPicker } from '../paperScoringPicker';
import { ShowHomePaperScores } from '../ShowHomePaperScores';
import type { ShowMapClassInput } from '../showMapTypes';

function cls(id: string, overrides: Partial<ShowMapClassInput> = {}): ShowMapClassInput {
  return {
    id,
    trialId: 'trial-1',
    name: id,
    element: 'Container',
    level: id,
    section: '',
    status: 'Scheduled',
    entryCount: 10,
    scoredCount: 0,
    trialName: 'Saturday Trial',
    trialDate: '2026-10-10',
    ...overrides,
  };
}

const TWO_TRIALS = [
  cls('Novice', { trialId: 't1', trialName: 'Sat Trial', trialNumber: '1' }),
  cls('Advanced', {
    trialId: 't2',
    trialName: 'Sat Trial',
    trialNumber: '2',
    status: 'Completed',
    entryCount: 4,
    scoredCount: 4,
  }),
  cls('Excellent', { trialId: 't3', trialName: 'Sat Trial', trialNumber: '3' }),
];

const MIXED = [
  cls('Novice', { status: 'Completed', entryCount: 4, scoredCount: 4 }),
  cls('Advanced', { entryCount: 12, scoredCount: 3 }),
  cls('Excellent', { entryCount: 8, scoredCount: 0 }),
  cls('Master', { entryCount: 0, scoredCount: 0 }),
  cls('Elite', { status: 'Cancelled' }),
];

describe('buildPaperScoringPicker', () => {
  it('puts partly scored first and completed classes in their own finished list', () => {
    const picker = buildPaperScoringPicker(MIXED);
    expect(picker.groups).toHaveLength(1);
    expect(picker.groups[0]?.classes.map(c => c.label)).toEqual([
      'Container Advanced',
      'Container Excellent',
      'Container Master',
    ]);
    expect(picker.groups[0]?.classes.map(c => c.progress)).toEqual([
      '3 of 12 scored',
      '0 of 8 scored',
      'No entries',
    ]);
    expect(picker.finished.map(c => c.label)).toEqual([
      expect.stringMatching(/^Container Novice · Saturday Trial - /),
    ]);
    expect(picker.finished[0]?.progress).toBe('4 of 4 scored');
    expect(picker.finished[0]?.done).toBe(true);
  });

  it('labels each finished class with its trial and keeps trial order', () => {
    const picker = buildPaperScoringPicker(TWO_TRIALS);
    expect(picker.groups.map(g => g.trialId)).toEqual(['t1', 't3']);
    expect(picker.finished.map(c => c.label)).toEqual([
      expect.stringMatching(/^Container Advanced · Sat Trial \(2\) - /),
    ]);
  });

  it('links each class to the paper scoring screen', () => {
    const picker = buildPaperScoringPicker([cls('c 1')]);
    expect(picker.groups[0]?.classes[0]?.href).toBe('/scoring/classes/c%201/entries?mode=split');
  });

  it('groups unfinished classes by trial in the order given', () => {
    const picker = buildPaperScoringPicker([
      cls('a', { trialId: 't1', trialName: 'Sat' }),
      cls('b', { trialId: 't2', trialName: 'Sun' }),
    ]);
    expect(picker.groups.map(g => g.trialId)).toEqual(['t1', 't2']);
    expect(picker.finished).toEqual([]);
  });

  it('keeps same-name, same-date trials apart by trial number', () => {
    const { groups } = buildPaperScoringPicker(
      ['1', '2'].map(n =>
        cls(`ina-${n}`, {
          trialId: `t${n}`,
          trialName: 'Saturday Trial',
          trialNumber: n,
          trialDate: '2026-10-10',
          element: 'Interior',
          level: 'Novice',
          section: 'A',
        })
      )
    );
    expect(groups[0]?.label).not.toBe(groups[1]?.label);
    expect(groups[0]?.label).toContain('(1)');
    expect(groups[1]?.label).toContain('(2)');
    expect(groups.map(g => g.classes[0]?.href)).toEqual([
      '/scoring/classes/ina-1/entries?mode=split',
      '/scoring/classes/ina-2/entries?mode=split',
    ]);
  });

  it('does not invent progress when the entries read failed', () => {
    const { groups } = buildPaperScoringPicker([cls('a', { entryCount: null, scoredCount: null })]);
    expect(groups[0]?.classes[0]?.progress).toBe('Progress unavailable');
  });
});

describe('ShowHomePaperScores', () => {
  it('opens a picker listing classes with progress', async () => {
    const { user } = render(<ShowHomePaperScores classes={MIXED} />);
    await user.click(screen.getByRole('button', { name: 'Enter results from scoresheet' }));
    const dialog = await screen.findByRole('dialog');
    const links = within(dialog).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/scoring/classes/Advanced/entries?mode=split');
    expect(links[0]).toHaveTextContent('3 of 12 scored');
    expect(links.at(-1)).toHaveAttribute('href', '/scoring/classes/Novice/entries?mode=split');
  });

  it('lists a completed Trial 2 class after every unfinished class of Trial 1 and 3', async () => {
    const { user } = render(<ShowHomePaperScores classes={TWO_TRIALS} />);
    await user.click(screen.getByRole('button', { name: 'Enter results from scoresheet' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual([
      '/scoring/classes/Novice/entries?mode=split',
      '/scoring/classes/Excellent/entries?mode=split',
      '/scoring/classes/Advanced/entries?mode=split',
    ]);
  });

  it('shows finished classes in a Finished group labelled with their trial', async () => {
    const { user } = render(<ShowHomePaperScores classes={TWO_TRIALS} />);
    await user.click(screen.getByRole('button', { name: 'Enter results from scoresheet' }));
    const dialog = await screen.findByRole('dialog');
    const finished = within(dialog).getByRole('region', { name: 'Finished' });
    expect(within(finished).getByRole('link')).toHaveTextContent('Container Advanced');
    expect(within(finished).getByRole('link')).toHaveTextContent('Sat Trial (2)');
  });

  it('has no Finished group when no class is finished', async () => {
    const { user } = render(
      <ShowHomePaperScores classes={[cls('a'), cls('b', { trialId: 't2' })]} />
    );
    await user.click(screen.getByRole('button', { name: 'Enter results from scoresheet' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
  });

  it('shows only the Finished group when every class is finished', async () => {
    const done = { status: 'Completed', entryCount: 2, scoredCount: 2 } as const;
    const { user } = render(
      <ShowHomePaperScores classes={[cls('a', done), cls('b', { ...done, trialId: 't2' })]} />
    );
    await user.click(screen.getByRole('button', { name: 'Enter results from scoresheet' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('region')
        .map(r => r.getAttribute('aria-label'))
    ).toEqual(['Finished']);
    expect(within(dialog).getAllByRole('link')).toHaveLength(2);
  });

  it('goes straight to the class when the show has exactly one', () => {
    render(<ShowHomePaperScores classes={[cls('only')]} />);
    expect(screen.getByRole('link', { name: 'Enter results from scoresheet' })).toHaveAttribute(
      'href',
      '/scoring/classes/only/entries?mode=split'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is shown for a viewer who may operate the show', () => {
    render(
      <TrialSecretaryAccessProvider reason={undefined}>
        <ShowHomePaperScores classes={MIXED} />
      </TrialSecretaryAccessProvider>
    );
    expect(
      screen.getByRole('button', { name: 'Enter results from scoresheet' })
    ).toBeInTheDocument();
  });

  it('is hidden for a club admin who is not the trial secretary', () => {
    render(
      <TrialSecretaryAccessProvider reason="Trial secretary access only">
        <ShowHomePaperScores classes={MIXED} />
      </TrialSecretaryAccessProvider>
    );
    expect(screen.queryByText('Enter results from scoresheet')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no classes', () => {
    render(<ShowHomePaperScores classes={[]} />);
    expect(screen.queryByText('Enter results from scoresheet')).not.toBeInTheDocument();
  });
});
