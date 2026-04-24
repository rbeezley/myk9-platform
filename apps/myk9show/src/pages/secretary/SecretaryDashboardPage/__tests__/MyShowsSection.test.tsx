import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { MyShowsSection } from '../MyShowsSection';
import { showFactory } from '@/test/utils/factories';

const FUTURE = new Date(Date.now() + 14 * 86_400_000).toISOString().split('T')[0];

function makeShow(id: string) {
  return showFactory.build({ id, name: `Show ${id}`, startDate: FUTURE, status: 'published' });
}

function renderSection(props: Partial<Parameters<typeof MyShowsSection>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MyShowsSection
        phase="upcoming"
        title="Upcoming shows"
        shows={[makeShow('s1')]}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('MyShowsSection', () => {
  it('renders null when shows array is empty', () => {
    const { container } = renderSection({ shows: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders the section title', () => {
    renderSection({ title: 'Upcoming shows' });
    expect(screen.getByText('Upcoming shows')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    renderSection({ subtitle: 'Published and accepting entries' });
    expect(screen.getByText('Published and accepting entries')).toBeInTheDocument();
  });

  it('renders show count in the toggle button', () => {
    renderSection({ shows: [makeShow('a'), makeShow('b')] });
    expect(screen.getByText(/2 shows/i)).toBeInTheDocument();
  });

  it('shows show cards by default when defaultCollapsed is false', () => {
    renderSection({ shows: [makeShow('s1')], defaultCollapsed: false });
    expect(screen.getByText('Show s1')).toBeInTheDocument();
  });

  it('hides show cards by default when defaultCollapsed is true', () => {
    renderSection({ shows: [makeShow('s1')], defaultCollapsed: true });
    expect(screen.queryByText('Show s1')).not.toBeInTheDocument();
  });

  it('toggles cards on header click', () => {
    renderSection({ shows: [makeShow('s1')], defaultCollapsed: true });
    expect(screen.queryByText('Show s1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Show s1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Show s1')).not.toBeInTheDocument();
  });

  it('renders multiple show cards', () => {
    renderSection({ shows: [makeShow('a'), makeShow('b'), makeShow('c')] });
    expect(screen.getByText('Show a')).toBeInTheDocument();
    expect(screen.getByText('Show b')).toBeInTheDocument();
    expect(screen.getByText('Show c')).toBeInTheDocument();
  });

  it('toggle button has aria-expanded attribute', () => {
    renderSection({ defaultCollapsed: false });
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});
