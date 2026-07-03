import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateScoreSheet } from './print-service';
import type { PrintClassInfo } from './print-types';

const classInfo: PrintClassInfo = {
  className: '</title><script>alert(1)</script>',
  element: null,
  level: null,
  section: null,
  judgeName: null,
  trialDate: '2026-07-03',
  trialNumber: '1',
  showName: 'Spring Trial',
  timeLimitSeconds: null,
  areaCount: null,
};

beforeEach(() => {
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
  } as unknown as Window);
});

describe('print-service', () => {
  it('escapes generated document titles before writing print windows', () => {
    generateScoreSheet(classInfo, []);

    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    const html = vi.mocked(openedWindow.document.write).mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('</title><script>alert(1)</script>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
