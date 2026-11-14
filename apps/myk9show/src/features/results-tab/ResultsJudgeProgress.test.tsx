import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import type { ReviewJudge } from '@/features/show-map/cockpit/trialPacket/judgeReview';
import type { JudgeRecord } from '@/features/show-map/cockpit/trialPacket/judgeRecord';
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

  describe("the judge's record", () => {
    function record(overrides: Partial<JudgeRecord>): JudgeRecord {
      return {
        key: 'judge:1|2026-12-07',
        judgeKey: 'judge:1',
        judgeId: 'p1',
        judgeName: 'Pat Donovan',
        registryId: 'AKC',
        day: '2026-12-07',
        dayLabel: 'Mon, Dec 7',
        ready: true,
        ...overrides,
      } as JudgeRecord;
    }

    it('offers it for each initialled day, and not for a day still open', async () => {
      const onRecord = vi.fn();
      const user = userEvent.setup();
      const open = record({
        key: 'judge:1|2026-12-08',
        day: '2026-12-08',
        dayLabel: 'Tue, Dec 8',
        ready: false,
      });
      render(
        <ResultsJudgeProgress
          judges={[judge({ initialled: true })]}
          onPrint={vi.fn()}
          records={[record({}), open]}
          onRecord={onRecord}
        />
      );

      expect(screen.queryByRole('button', { name: /Tue, Dec 8/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: "Judge's record, Mon, Dec 7" }));
      expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ key: 'judge:1|2026-12-07' }));
    });

    it('shows the UKC reminder at the same moment, and only for UKC', () => {
      render(
        <ResultsJudgeProgress
          judges={[judge({ registryId: 'UKC', initialled: true })]}
          onPrint={vi.fn()}
          records={[record({ registryId: 'UKC' })]}
          onRecord={vi.fn()}
        />
      );

      expect(
        screen.getByText("UKC: give the judge a copy of the signed judge's book before they leave.")
      ).toBeInTheDocument();
    });

    it('shows no reminder for AKC', () => {
      render(
        <ResultsJudgeProgress
          judges={[judge({ initialled: true })]}
          onPrint={vi.fn()}
          records={[record({})]}
          onRecord={vi.fn()}
        />
      );

      expect(screen.queryByText(/signed judge's book/)).toBeNull();
    });
  });
});
