import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
import { AKCFastCatLiveScoresheet } from './AKC/AKCFastCatLiveScoresheet';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import { UKCRallyLiveScoresheet } from './UKC/UKCRallyLiveScoresheet';
import { UKCObedienceLiveScoresheet } from './UKC/UKCObedienceLiveScoresheet';
import { ResultChoiceChips } from '../ResultChoiceChips';
import type { LiveScoresheetProps } from '../../types';

// MYK9-1501: every sport's scoresheet is the shared shell, so Cancel / Save sit in one
// pinned bar after the content, the dog is the header, and the manual time field stays.
// (Pixel geometry at 375 x 667 is measured in a real browser, see the PR.)

const sheets: [string, ComponentType<LiveScoresheetProps>][] = [
  ['AKC Scent Work', AKCScentWorkLiveScoresheet],
  ['AKC Nationals', AKCNationalsLiveScoresheet],
  ['AKC FastCAT', AKCFastCatLiveScoresheet],
  ['ASCA Scent Detection', ASCAScentDetectionLiveScoresheet],
  ['UKC Nosework', UKCNoseworkLiveScoresheet],
  ['UKC Rally', UKCRallyLiveScoresheet],
  ['UKC Obedience', UKCObedienceLiveScoresheet],
];

function props(onBack = vi.fn()): LiveScoresheetProps {
  return {
    entry: {
      id: '1',
      armband: 1204,
      dogName: 'Rex',
      breed: 'Beagle',
      handlerName: 'Jane Smith',
      className: 'Class',
      element: 'Interior',
      level: 'Novice',
    },
    classInfo: { element: 'Interior', level: 'Novice' },
    rules: {
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 180,
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    },
    onSubmit: vi.fn(),
    onBack,
  };
}

describe.each(sheets)('%s: phone layout', (_name, Sheet) => {
  it('puts Cancel and Save in the action bar, after all the content', () => {
    const onBack = vi.fn();
    const { container } = render(<Sheet {...props(onBack)} />);
    const bar = screen.getByTestId('scoresheet-action-bar');
    expect(within(bar).getByTestId('submit-btn')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="submit-btn"]')).toHaveLength(1);
    expect(bar.parentElement?.lastElementChild).toBe(bar);

    fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('merges the dog into the header: Up, armband, name, breed and handler', () => {
    render(<Sheet {...props()} />);
    const header = screen.getByRole('banner');
    expect(header.firstElementChild).toBe(screen.getByRole('button', { name: 'Entries' }));
    expect(within(header).getByTestId('scoresheet-armband').textContent).toBe('1204');
    expect(within(header).getByText('Rex')).toBeInTheDocument();
    expect(within(header).getByText('Beagle')).toBeInTheDocument();
    expect(within(header).getByText('Handler: Jane Smith')).toBeInTheDocument();
  });
});

describe('ResultChoiceChips faults', () => {
  it('puts the label and both 44px steppers on one row, with the stepper hit areas', () => {
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={1}
        onFaultCountChange={vi.fn()}
      />
    );
    const label = screen.getByText('Faults');
    const row = label.parentElement as HTMLElement;
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['-', '+']);
    expect(within(row).getByText('1')).toBeInTheDocument();
    for (const b of buttons) expect(b.className).toMatch(/\bh-11\b.*\bw-11\b|\bw-11\b.*\bh-11\b/);
  });

  it('keeps the max-faults note and stops the + at the ASCA limit', () => {
    const onChange = vi.fn();
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={2}
        onFaultCountChange={onChange}
        sportType="ASCA_SCENT_DETECTION"
        level="Novice"
      />
    );
    expect(screen.getByText('(max 2)')).toBeInTheDocument();
    expect(screen.getByText('At maximum faults for Novice level')).toBeInTheDocument();
    const plus = screen.getByRole('button', { name: 'Add a fault' });
    expect(plus).toBeDisabled();
    fireEvent.click(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps down and up by one', () => {
    const onChange = vi.fn();
    render(
      <ResultChoiceChips
        selectedResult="Q"
        onResultChange={vi.fn()}
        faultCount={1}
        onFaultCountChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove a fault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a fault' }));
    expect(onChange.mock.calls).toEqual([[0], [2]]);
  });
});

describe('manual time field', () => {
  it('stays on the timed sheets with the timer stopped, and types a time', () => {
    render(<AKCScentWorkLiveScoresheet {...props()} />);
    const input = screen.getByLabelText('Area 1 time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1:23.45' } });
    expect(input.value).toBe('1:23.45');
    expect(screen.getByText('Max: 3:00')).toBeInTheDocument();
  });

  // MYK9-1503: the numeric pad is the way in; digits fill from the right and a live
  // line says what was understood before the judge leaves the field.
  it('opens a numeric keypad and previews what the digits mean', () => {
    render(<AKCScentWorkLiveScoresheet {...props()} />);
    const input = screen.getByLabelText('Area 1 time') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('numeric');
    fireEvent.change(input, { target: { value: '125' } });
    expect(screen.getByTestId('duration-preview')).toHaveTextContent('= 0:01.25');
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('says why a time cannot be used and holds it as typed', () => {
    render(<AKCScentWorkLiveScoresheet {...props()} />);
    const input = screen.getByLabelText('Area 1 time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1:99.00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('99 seconds is 2:39.00');
    expect(input.value).toBe('1:99.00');
  });
});
