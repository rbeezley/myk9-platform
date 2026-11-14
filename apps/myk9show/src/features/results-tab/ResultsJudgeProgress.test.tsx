import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { ReviewJudge } from '@/features/show-map/cockpit/trialPacket/judgeReview';
import { render, screen } from '@/test/utils/testUtils';

import { ResultsJudgeProgress } from './ResultsJudgeProgress';

function judge(overrides: Partial<ReviewJudge>): ReviewJudge {
  return {
    key: 'judge:1',
    judgeName: 'Pat Donovan',
    registryId: 'AKC',
    classes: [{}, {}, {}, {}] as ReviewJudge['classes'],
    pageTotal: 6,
    done: true,
    initialled: false,
    finishedCount: 4,
    ...overrides,
  };
}

describe('ResultsJudgeProgress', () => {
  it('counts the judges who have initialled and offers the packet to a judge who is done', async () => {
    const onPrint = vi.fn();
    const user = userEvent.setup();
    render(
      <ResultsJudgeProgress
        judges={[
          judge({}),
          judge({ key: 'judge:2', judgeName: 'Sam Lee', initialled: true }),
          judge({ key: 'judge:3', judgeName: 'Ana Ruiz', done: false, finishedCount: 2 }),
        ]}
        onPrint={onPrint}
      />
    );

    expect(screen.getByRole('heading', { name: '1 of 3 judges initialled' })).toBeInTheDocument();
    expect(screen.getByText("Pat Donovan's classes are done.")).toBeInTheDocument();
    expect(screen.getByText('2 of 4 classes done')).toBeInTheDocument();
    expect(screen.getByText('All initialled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Print results for initials' }));
    expect(onPrint).toHaveBeenCalledWith('judge:1');
    await user.click(screen.getByRole('button', { name: 'Print results so far' }));
    expect(onPrint).toHaveBeenCalledWith('judge:3');
    await user.click(screen.getByRole('button', { name: 'Print again' }));
    expect(onPrint).toHaveBeenCalledWith('judge:2');
    await user.click(screen.getByRole('button', { name: /Print every judge/ }));
    expect(onPrint).toHaveBeenLastCalledWith(null);
  });

  it('says signed, not initialled, outside AKC', () => {
    render(<ResultsJudgeProgress judges={[judge({ registryId: 'UKC' })]} onPrint={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '0 of 1 judge signed' })).toBeInTheDocument();
  });

  it('shows nothing when no judge has a class to review', () => {
    const { container } = render(<ResultsJudgeProgress judges={[]} onPrint={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
