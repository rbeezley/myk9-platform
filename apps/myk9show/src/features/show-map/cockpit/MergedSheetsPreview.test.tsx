import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  merges: [] as Array<{ resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>,
}));

vi.mock('@/lib/reports/reportRegistry', () => ({
  getReportById: () => ({ defaultSort: 'run-order', buildPdf: () => new Uint8Array([1]) }),
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewPages', () => ({
  buildPages: () => [{}],
}));
vi.mock('./mergeReportPdfs', () => ({
  mergeReportPdfs: () =>
    new Promise<Uint8Array>((resolve, reject) => mocks.merges.push({ resolve, reject })),
}));

import { MergedSheetsPreview } from './MergedSheetsPreview';

const show = { id: 'show-1' } as never;

function view(entries: unknown[], onReadyChange = vi.fn()) {
  const ref = createRef<HTMLIFrameElement>();
  const ui = (rows: unknown[]) => (
    <MergedSheetsPreview
      reportIds={['check-in-sheet', 'scoresheet']}
      show={show}
      trials={[]}
      classes={[]}
      entries={rows}
      trialId="t1"
      classId="c1"
      ready
      iframeRef={ref}
      onReadyChange={onReadyChange}
    />
  );
  const result = render(ui(entries));
  return { ref, onReadyChange, rerender: (rows: unknown[]) => result.rerender(ui(rows)) };
}

describe('MergedSheetsPreview freshness', () => {
  let urls = 0;
  beforeEach(() => {
    mocks.merges.length = 0;
    urls = 0;
    URL.createObjectURL = vi.fn(() => `blob:merged-${++urls}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('empties the frame and reports not ready when the inputs change, until the new build lands', async () => {
    const { ref, onReadyChange, rerender } = view([{ id: 'a' }]);
    await act(async () => mocks.merges[0]!.resolve(new Uint8Array([1])));
    await waitFor(() => expect(ref.current!.src).toBe('blob:merged-1'));
    expect(onReadyChange).toHaveBeenLastCalledWith(true);

    rerender([{ id: 'a' }, { id: 'b' }]);
    expect(ref.current!.src).not.toMatch(/^blob:/);
    expect(onReadyChange).toHaveBeenLastCalledWith(false);

    await act(async () => mocks.merges[1]!.resolve(new Uint8Array([2])));
    await waitFor(() => expect(ref.current!.src).toBe('blob:merged-2'));
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
  });

  it('ignores an older build that resolves after a newer one started', async () => {
    const { ref, rerender } = view([{ id: 'a' }]);
    rerender([{ id: 'a' }, { id: 'b' }]);
    await act(async () => mocks.merges[0]!.resolve(new Uint8Array([1])));
    expect(ref.current!.src).not.toMatch(/^blob:/);
    await act(async () => mocks.merges[1]!.resolve(new Uint8Array([2])));
    await waitFor(() => expect(ref.current!.src).toBe('blob:merged-1'));
  });

  it('leaves the frame empty, not ready, and says so when the new build fails', async () => {
    const { ref, onReadyChange, rerender } = view([{ id: 'a' }]);
    await act(async () => mocks.merges[0]!.resolve(new Uint8Array([1])));
    await waitFor(() => expect(ref.current!.src).toMatch(/^blob:/));
    rerender([{ id: 'a' }, { id: 'b' }]);
    await act(async () => mocks.merges[1]!.reject(new Error('boom')));
    expect(ref.current!.src).not.toMatch(/^blob:/);
    expect(onReadyChange).toHaveBeenLastCalledWith(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be combined');
  });
});
