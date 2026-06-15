import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { CompactOfflineIndicator } from './atShowLayoutSlotComponents';

describe('CompactOfflineIndicator', () => {
  it('labels offline capability without implying the device is currently offline', () => {
    render(<CompactOfflineIndicator />);

    expect(screen.getByText('Offline ready')).toBeInTheDocument();
    expect(screen.queryByText(/^Offline$/)).toBeNull();
  });
});
