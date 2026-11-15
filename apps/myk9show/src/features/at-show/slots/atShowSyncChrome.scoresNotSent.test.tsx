import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { SyncIndicator } from './atShowSyncChrome';

describe('entry list "not sent" pill (MYK9-2011)', () => {
  it('counts in scores and opens Scores not sent', () => {
    render(
      <Routes>
        <Route
          path="/at-show/:showId/class/:classId"
          element={<SyncIndicator status="pending" compact pendingCount={1} />}
        />
      </Routes>,
      { initialRoute: '/at-show/show-1/class/c1' }
    );
    const link = screen.getByRole('link', { name: '1 score not sent yet' });
    expect(link).toHaveAttribute('href', '/at-show/show-1/scores-not-sent');
  });

  it('is a plain status with nothing to send', () => {
    render(<SyncIndicator status="syncing" compact />, { initialRoute: '/at-show/show-1' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
