/**
 * MYK9-280 — report components must render in a DETACHED tree.
 *
 * `ReportPreview` builds every report with `ReactDOMServer.renderToStaticMarkup`,
 * which renders with no provider context. A component that calls a React Query
 * hook throws `No QueryClient set` there and the entire preview is replaced by an
 * error boundary. Production minifies the cause away, so it looks like a broken
 * page rather than a broken contract — `AKC Scent Work Entry Form` and
 * `Judge Supply Checklists` were both unreachable this way.
 *
 * These tests reproduce the real render path rather than grepping the source for
 * hook names: a source scan can only prove somebody typed `useQuery`, and would
 * be satisfied by a comment mentioning it.
 */
import { describe, it, expect } from 'vitest';
import ReactDOMServer from 'react-dom/server';
import { AKCScentWorkEntryForm } from '@/components/reports/AKCScentWorkEntryForm';
import { reportRegistry } from '@/lib/reports/reportRegistry';
import type { ReportProps, ReportEntryFormData } from '@/lib/reports/types';

const BASE_PROPS: ReportProps = {
  showId: 'show-1',
  showName: 'Test Show',
  entries: [],
  sortOrder: 'run-order',
  allTrials: [],
  allClasses: [],
};

const SECRETARY = {
  name: 'Test Secretary',
  streetAddress: '100 Dog Show Lane',
  city: 'Tulsa',
  state: 'OK',
  zipCode: '74101',
};

const ENTRY_FORM_DATA: ReportEntryFormData = {
  dogs: [
    {
      dogId: 'dog-1',
      callName: 'Rex',
      breed: 'Border Collie',
      sex: 'Male',
      dateOfBirth: '2020-01-01',
      registration: null,
      breeder: null,
      sire: null,
      dam: null,
      owner: {
        firstName: 'Ada',
        lastName: 'Owner',
        streetAddress: '1 Main St',
        city: 'Tulsa',
        state: 'OK',
        zipCode: '74101',
      },
      handler: null,
      armband: 1,
      entries: [],
      agreementDate: '2026-08-01',
    },
  ] as unknown as ReportEntryFormData['dogs'],
  secretary: SECRETARY as unknown as ReportEntryFormData['secretary'],
  trials: [],
  show: null,
  isLoading: false,
  isError: false,
};

describe('report components are props-driven', () => {
  it('every registry component renders detached without a provider', () => {
    const failures: string[] = [];

    for (const report of reportRegistry) {
      if (report.buildPdf || !report.component) continue;
      const Component = report.component;
      try {
        ReactDOMServer.renderToStaticMarkup(<Component {...BASE_PROPS} />);
      } catch (error) {
        failures.push(`${report.id}: ${(error as Error).message}`);
      }
    }

    // Named individually so a regression says WHICH report broke and why.
    expect(failures).toEqual([]);
  });

  it('the entry form prints the named official it is handed', () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      <AKCScentWorkEntryForm {...BASE_PROPS} entryFormData={ENTRY_FORM_DATA} />
    );

    // The whole point of the report: the Trial Secretary reaches the paperwork.
    expect(markup).toContain('Test Secretary');
  });

  it('renders the empty state, not a crash, when no official data is supplied', () => {
    // The host passes nothing for reports that need no async data. That must
    // stay a rendered page rather than a thrown hook.
    const markup = ReactDOMServer.renderToStaticMarkup(<AKCScentWorkEntryForm {...BASE_PROPS} />);
    expect(markup).toContain('No entries found');
  });
});
