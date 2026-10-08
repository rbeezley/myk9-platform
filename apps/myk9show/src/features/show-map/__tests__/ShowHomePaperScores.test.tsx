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

const MIXED = [
  cls('Novice', { status: 'Completed', entryCount: 4, scoredCount: 4 }),
  cls('Advanced', { entryCount: 12, scoredCount: 3 }),
  cls('Excellent', { entryCount: 8, scoredCount: 0 }),
  cls('Master', { entryCount: 0, scoredCount: 0 }),
  cls('Elite', { status: 'Cancelled' }),
];

describe('buildPaperScoringPicker', () => {
  it('puts partly scored first, completed last, and drops cancelled', () => {
    const [group] = buildPaperScoringPicker(MIXED);
    expect(group?.classes.map(c => c.label)).toEqual([
      'Container Advanced',
      'Container Excellent',
      'Container Master',
      'Container Novice',
    ]);
    expect(group?.classes.map(c => c.progress)).toEqual([
      '3 of 12 scored',
      '0 of 8 scored',
      'No entries',
      '4 of 4 scored',
    ]);
    expect(group?.classes.at(-1)?.done).toBe(true);
  });

  it('links each class to the paper scoring screen', () => {
    const [group] = buildPaperScoringPicker([cls('c 1')]);
    expect(group?.classes[0]?.href).toBe('/scoring/classes/c%201/entries?mode=split');
  });

  it('groups by trial in the order given', () => {
    const groups = buildPaperScoringPicker([
      cls('a', { trialId: 't1', trialName: 'Sat' }),
      cls('b', { trialId: 't2', trialName: 'Sun' }),
    ]);
    expect(groups.map(g => g.trialId)).toEqual(['t1', 't2']);
  });

  it('does not invent progress when the entries read failed', () => {
    const [group] = buildPaperScoringPicker([cls('a', { entryCount: null, scoredCount: null })]);
    expect(group?.classes[0]?.progress).toBe('Progress unavailable');
  });
});

describe('ShowHomePaperScores', () => {
  it('opens a picker listing classes with progress', async () => {
    const { user } = render(<ShowHomePaperScores classes={MIXED} />);
    await user.click(screen.getByRole('button', { name: 'Enter paper scores' }));
    const dialog = await screen.findByRole('dialog');
    const links = within(dialog).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/scoring/classes/Advanced/entries?mode=split');
    expect(links[0]).toHaveTextContent('3 of 12 scored');
    expect(links.at(-1)).toHaveAttribute('href', '/scoring/classes/Novice/entries?mode=split');
  });

  it('goes straight to the class when the show has exactly one', () => {
    render(<ShowHomePaperScores classes={[cls('only')]} />);
    expect(screen.getByRole('link', { name: 'Enter paper scores' })).toHaveAttribute(
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
    expect(screen.getByRole('button', { name: 'Enter paper scores' })).toBeInTheDocument();
  });

  it('is hidden for a club admin who is not the trial secretary', () => {
    render(
      <TrialSecretaryAccessProvider reason="Trial secretary access only">
        <ShowHomePaperScores classes={MIXED} />
      </TrialSecretaryAccessProvider>
    );
    expect(screen.queryByText('Enter paper scores')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no classes', () => {
    render(<ShowHomePaperScores classes={[]} />);
    expect(screen.queryByText('Enter paper scores')).not.toBeInTheDocument();
  });
});
