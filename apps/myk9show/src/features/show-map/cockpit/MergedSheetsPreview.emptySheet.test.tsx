import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/reports/reportRegistry', () => ({
  getReportById: (id: string) => ({
    defaultSort: 'run-order',
    buildPdf: () => (id === 'scoresheet' ? null : new Uint8Array([1])),
  }),
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewPages', () => ({
  buildPages: () => [{}],
}));
vi.mock('./mergeReportPdfs', () => ({
  mergeReportPdfs: () => new Promise<Uint8Array>(() => {}),
}));

import { MergedSheetsPreview } from './MergedSheetsPreview';

describe('MergedSheetsPreview with a sheet that has no running dog (MYK9-2387)', () => {
  it('names the skipped sheet instead of implying it will print', () => {
    render(
      <MergedSheetsPreview
        reportIds={['check-in-sheet', 'scoresheet']}
        show={{ id: 'show-1' } as never}
        trials={[]}
        classes={[]}
        entries={[]}
        trialId="t1"
        classId="c1"
        ready
        iframeRef={createRef<HTMLIFrameElement>()}
        labelOf={id => (id === 'scoresheet' ? 'Judge Score Sheet' : id)}
      />
    );
    expect(
      screen.getByText('Judge Score Sheet will not print: no dog in this class is running.')
    ).toBeInTheDocument();
  });
});
