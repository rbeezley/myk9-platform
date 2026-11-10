import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { ReportProps } from '@/lib/reports/types';
import { buildAKCTrialChairmanReportValues } from '@/features/organization-forms/akcTrialChairmanReport';
import { AKC_TRIAL_CHAIRMAN_REPORT_FIELDS } from '@/features/organization-forms/akcTrialChairmanReportFields';
import { registryFormJudgeName } from '@/utils/classJudgeDisplay';
import { AKCJudgeReport } from '../AKCJudgeReport';
import { JudgesCertification } from '../JudgesCertification';
import { TrialChairmanReport } from '../TrialChairmanReport';
import { TrialSecretaryReport } from '../TrialSecretaryReport';

// MYK9-1846: registry forms keep main's "TBD" for an unset judge until the owner decides
// otherwise; the display label must never reach them.
const LABEL = 'Judge to be announced';

const props = (judgeName: string): ReportProps => ({
  showName: 'Spring Scent Trial',
  clubName: 'Demo Club',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName },
  allClasses: [{ id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', judgeName }],
  entries: [],
});

describe('registry forms with an unset judge (MYK9-1846)', () => {
  it.each([
    ['AKCJudgeReport', AKCJudgeReport],
    ['TrialSecretaryReport', TrialSecretaryReport],
    ['TrialChairmanReport', TrialChairmanReport],
    ['JudgesCertification', JudgesCertification],
  ] as const)('%s prints TBD, never the label', (_name, Form) => {
    const { container } = render(<Form {...props(LABEL)} />);
    expect(container.textContent).toContain('TBD');
    expect(container.textContent).not.toContain(LABEL);
  });

  it('the Trial Chairman PDF prints TBD for the judge, never the label', () => {
    const values = buildAKCTrialChairmanReportValues(props(LABEL));
    expect(values.text?.[AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1]).toBe('TBD');
  });

  it('registryFormJudgeName: real name stays, any unset form becomes TBD, blank stays blank', () => {
    expect(registryFormJudgeName(' Pat Judge ')).toBe('Pat Judge');
    for (const unset of [LABEL, 'No judge yet', 'TBD']) {
      expect(registryFormJudgeName(unset)).toBe('TBD');
    }
    expect(registryFormJudgeName('')).toBeUndefined();
    expect(registryFormJudgeName(undefined)).toBeUndefined();
  });
});
