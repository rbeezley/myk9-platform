import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { TrialChairmanReport } from '@/components/reports/TrialChairmanReport';
import { TrialSecretaryReport } from '@/components/reports/TrialSecretaryReport';
import type { TrialOfficials } from '@/lib/reports/types';
import type { DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { buildTrialReportProps } from '../reportDataMapping';

const show = { id: 'show-1', name: 'Spring Trial', clubName: 'Demo Club' } as Show;
const trial = fromAny<DbTrial, unknown>({
  id: 'trial-1',
  date: '2026-04-12',
  registry_id: 'AKC',
  trial_number: '1',
});

const person = {
  streetAddress: null,
  city: null,
  state: null,
  zipCode: null,
};
const officials: TrialOfficials = {
  chairperson: { ...person, name: 'Casey Chair', phone: '555-0100', email: 'casey@example.com' },
  secretary: { ...person, name: 'Sam Secretary', phone: null, email: null },
};

function build(withOfficials: TrialOfficials | null | undefined) {
  return buildTrialReportProps({
    show,
    trials: [trial],
    classes: [],
    entries: [],
    scope: { kind: 'show', showId: 'show-1' },
    sortOrder: '',
    ...(withOfficials !== undefined ? { officials: withOfficials } : {}),
  });
}

describe('buildTrialReportProps officials (MYK9-1386)', () => {
  it('carries officials onto the props it hand-builds, so the reports print them', () => {
    const [props] = build(officials);
    expect(props?.officials).toEqual(officials);

    const chairHtml = renderToStaticMarkup(<TrialChairmanReport {...props!} />);
    expect(chairHtml).toContain('Casey Chair');
    expect(chairHtml).toContain('555-0100');
    const secretaryHtml = renderToStaticMarkup(<TrialSecretaryReport {...props!} />);
    expect(secretaryHtml).toContain('Sam Secretary');
  });

  it.each([undefined, null])('adds no officials key when given %s', value => {
    const [props] = build(value);
    expect(props).not.toHaveProperty('officials');
  });
});
