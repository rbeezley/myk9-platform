import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { ReportPreview } from '../ReportPreview';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  organization: 'AKC',
  startDate: '2026-05-11',
  endDate: '2026-05-11',
} as Show;

const akcTrials = fromAny<DbTrial[], unknown>([
  { id: 'trial-1', trial_number: 1, date: '2026-05-11', registry_id: 'AKC' },
]);
const ukcTrials = fromAny<DbTrial[], unknown>([{ ...akcTrials[0], registry_id: 'UKC' }]);

const judged = {
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Buried',
  level: 'Novice',
  section: '',
  judge_assignments: [{ person_id: 'j1', people: { first_name: 'Judge', last_name: 'One' } }],
};
const unjudged = {
  id: 'class-2',
  trial_id: 'trial-1',
  element: 'Interior',
  level: 'Advanced',
  section: 'A',
  judge_assignments: [],
  judge: 'TBD',
};
const classes = [judged, unjudged] as unknown as DbClass[];
const allJudged = [judged] as unknown as DbClass[];

const entries = [
  { id: 'entry-1', class_id: 'class-1', armband: 101, run_order: 1 },
  { id: 'entry-2', class_id: 'class-2', armband: 202, run_order: 1 },
] as unknown as DbEntry[];

function renderPreview(
  reportType: string,
  overrides: { classes?: DbClass[]; trials?: DbTrial[]; classId?: string } = {}
) {
  return render(
    <ReportPreview
      reportType={reportType}
      show={show}
      trials={overrides.trials ?? akcTrials}
      classes={overrides.classes ?? classes}
      entries={entries}
      trialId="trial-1"
      classId={overrides.classId ?? 'all'}
      dogId="all"
      sortOrder="placement"
      isLoading={false}
      isError={false}
      dataState="ready"
      hosted={{ hostedState: 'ready', refetch: () => {} }}
    />
  );
}

const OFFICIAL_AKC_FORMS = [
  'akc-judge-report',
  'trial-chairman-report',
  'trial-secretary-report',
  'judges-certification',
  'result-catalog',
];

describe('official AKC forms refuse to print while a class has no judge (MYK9-1854)', () => {
  it.each(OFFICIAL_AKC_FORMS)(
    '%s shows one message naming the class and renders no form',
    reportType => {
      renderPreview(reportType);

      expect(screen.getByRole('status')).toHaveTextContent(
        'These classes need a judge before you can print this form: Interior Advanced A.'
      );
      expect(screen.queryByTitle('Report Preview')).not.toBeInTheDocument();
    }
  );

  it.each(OFFICIAL_AKC_FORMS)(
    '%s renders the form once every class has a judge',
    async reportType => {
      renderPreview(reportType, { classes: allJudged });

      const iframe = screen.getByTitle('Report Preview') as HTMLIFrameElement;
      await waitFor(() => {
        expect(iframe.contentDocument?.body.textContent ?? '').not.toBe('');
      });
      expect(screen.queryByText(/need a judge/)).not.toBeInTheDocument();
    }
  );

  it('never judges a UKC trial by the AKC rule', () => {
    renderPreview('trial-secretary-report', { trials: ukcTrials });

    expect(screen.queryByText(/need a judge/)).not.toBeInTheDocument();
  });
});

describe('club reports print "Judge to be announced" for an unset judge (MYK9-1854)', () => {
  it.each(['judges-schedule', 'judge-entry-counts', 'results-sheet'])(
    '%s prints the label, never TBD',
    async reportType => {
      renderPreview(reportType, reportType === 'results-sheet' ? { classId: 'class-2' } : {});

      const iframe = screen.getByTitle('Report Preview') as HTMLIFrameElement;
      await waitFor(() => {
        expect(iframe.contentDocument?.body.textContent ?? '').toContain('Judge to be announced');
      });
      expect(iframe.contentDocument?.body.textContent ?? '').not.toContain('TBD');
      expect(screen.queryByText(/need a judge/)).not.toBeInTheDocument();
    }
  );
});
