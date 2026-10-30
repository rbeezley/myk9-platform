import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MyShowsLiveSync } from './MyShowsLiveSync';
import { useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';

vi.mock('@/features/show-live-sync/useShowLiveSync', () => ({ useShowLiveSync: vi.fn() }));

describe('MyShowsLiveSync', () => {
  it('mounts live sync once per distinct show and skips empty ids', () => {
    render(<MyShowsLiveSync showIds={['show-1', 'show-2', 'show-1', '']} />);
    const ids = vi.mocked(useShowLiveSync).mock.calls.map(call => call[0]);
    expect([...new Set(ids)].sort()).toEqual(['show-1', 'show-2']);
  });
});
