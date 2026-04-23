import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UndocumentedRoutesPanel } from '../components/UndocumentedRoutesPanel';

describe('UndocumentedRoutesPanel', () => {
  it('renders nothing when both lists are empty', () => {
    const { container } = render(<UndocumentedRoutesPanel missing={[]} extra={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a Missing section when missing has entries', () => {
    render(<UndocumentedRoutesPanel missing={['/admin/new-page']} extra={[]} />);
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
    expect(screen.getByText('/admin/new-page')).toBeInTheDocument();
  });

  it('renders an Extra section when extra has entries', () => {
    render(<UndocumentedRoutesPanel missing={[]} extra={['/old-route']} />);
    expect(screen.getByText(/extra/i)).toBeInTheDocument();
    expect(screen.getByText('/old-route')).toBeInTheDocument();
  });

  it('renders both sections when both lists are non-empty', () => {
    render(<UndocumentedRoutesPanel missing={['/admin/new-page']} extra={['/old-route']} />);
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
    expect(screen.getByText(/extra/i)).toBeInTheDocument();
    expect(screen.getByText('/admin/new-page')).toBeInTheDocument();
    expect(screen.getByText('/old-route')).toBeInTheDocument();
  });
});
