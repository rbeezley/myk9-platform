import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import Home from '@/pages/Home';

vi.mock('@/features/show-today/ShowTodayBanner', () => ({
  ShowTodayBanner: () => null,
}));

describe('Home branding copy', () => {
  it('mentions the ringside lineage once, in the trust section', () => {
    render(<Home />, { initialRoute: '/' });

    const lineageMatches = screen.getAllByText(/the ringside tools you may know as myK9Q/);
    expect(lineageMatches).toHaveLength(1);
    expect(lineageMatches[0].closest('section')).toHaveAttribute('id', 'about');
  });
});
