import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AtShowRefreshLiveRegion, getRefreshAnswer } from './atShowRefreshAnswer';
import { CLASS_REFRESH_MESSAGES } from './useAtShowClassRefresh';

describe('getRefreshAnswer', () => {
  it('has no answer while idle or refreshing', () => {
    expect(getRefreshAnswer('idle')).toBeNull();
    expect(getRefreshAnswer('refreshing')).toBeNull();
  });

  it('answers done calmly and failed or offline as a warning', () => {
    expect(getRefreshAnswer('done')).toEqual({ message: 'Up to date', tone: 'ok' });
    expect(getRefreshAnswer('failed')).toEqual({
      message: CLASS_REFRESH_MESSAGES.failed,
      tone: 'warn',
    });
    expect(getRefreshAnswer('offline')).toEqual({
      message: CLASS_REFRESH_MESSAGES.offline,
      tone: 'warn',
    });
  });
});

describe('AtShowRefreshLiveRegion', () => {
  it('stays mounted and empty while idle', () => {
    render(<AtShowRefreshLiveRegion phase="idle" />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it.each(['done', 'failed', 'offline'] as const)('announces %s politely', phase => {
    const { rerender } = render(<AtShowRefreshLiveRegion phase="idle" />);
    const region = screen.getByRole('status');
    rerender(<AtShowRefreshLiveRegion phase={phase} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe(CLASS_REFRESH_MESSAGES[phase]);
    expect(region.getAttribute('aria-live')).toBe('polite');
  });
});
