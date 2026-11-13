import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const mocks = vi.hoisted(() => ({
  merges: [] as Array<{ resolve: (b: Uint8Array) => void }>,
}));

vi.mock('@/lib/reports/reportRegistry', () => ({
  getReportById: () => ({ defaultSort: 'run-order', buildPdf: () => new Uint8Array([1]) }),
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewPages', () => ({
  buildPages: () => [{}],
}));
vi.mock('./mergeReportPdfs', () => ({
  mergeReportPdfs: () => new Promise<Uint8Array>(resolve => mocks.merges.push({ resolve })),
}));

import { MergedSheetsPreview } from './MergedSheetsPreview';

const show = { id: 'show-1' } as never;
const frameRef = createRef<HTMLIFrameElement>();
// Stable across renders, like the panel's own data: a fresh array each render would rebuild forever.
const REPORT_IDS = ['check-in-sheet', 'scoresheet'];
const NO_ROWS: unknown[] = [];

/** The panel's shape: a Print button whose enabled state is the child's reported readiness. */
function Harness({ entries }: { entries: unknown[] }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <MergedSheetsPreview
        reportIds={REPORT_IDS}
        show={show}
        trials={NO_ROWS}
        classes={NO_ROWS}
        entries={entries}
        trialId="t1"
        classId="c1"
        ready
        iframeRef={frameRef}
        onReadyChange={setReady}
      />
      <button type="button" disabled={!ready}>
        Print 2 sheets
      </button>
    </>
  );
}

describe('MergedSheetsPreview readiness gap (MYK9-1904)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let urls = 0;
  beforeEach(() => {
    mocks.merges.length = 0;
    urls = 0;
    URL.createObjectURL = vi.fn(() => `blob:merged-${++urls}`);
    URL.revokeObjectURL = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('never leaves Print enabled over a frame that no longer holds the current sheets', async () => {
    await act(async () => root.render(<Harness entries={[{ id: 'a' }]} />));
    await vi.waitFor(() => expect(mocks.merges).toHaveLength(1));
    await act(async () => mocks.merges[0]!.resolve(new Uint8Array([1])));
    const button = container.querySelector('button')!;
    await vi.waitFor(() => expect(frameRef.current!.src).toBe('blob:merged-1'));
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    // A real input change arrives from a data read, outside any event or act(): the browser
    // gets a chance to run a click between React's commit and its follow-up render.
    const wasEnabledOverEmptyFrame: boolean[] = [];
    const observer = new MutationObserver(() => {
      if (!frameRef.current!.src.startsWith('blob:') && !button.disabled) {
        wasEnabledOverEmptyFrame.push(true);
      }
    });
    observer.observe(frameRef.current!, { attributes: true, attributeFilter: ['src'] });
    const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      root.render(<Harness entries={[{ id: 'a' }, { id: 'b' }]} />);
      await vi.waitFor(() => expect(frameRef.current!.src).not.toMatch(/^blob:/));
      await vi.waitFor(() => expect(mocks.merges).toHaveLength(2));
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
      observer.disconnect();
    }
    expect(button.disabled).toBe(true);
    expect(wasEnabledOverEmptyFrame).toEqual([]);
  });
});
