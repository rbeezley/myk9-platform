import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PlatformAdministrationSection } from './PlatformAdministrationSection';

describe('PlatformAdministrationSection', () => {
  it('renders the admin cards linking to their destinations', () => {
    render(<PlatformAdministrationSection userCount={7} />, { initialRoute: '/admin/dashboard' });

    const userLink = screen.getByRole('link', { name: /User Management/i });
    expect(userLink).toHaveAttribute('href', '/admin/users');

    const alertsLink = screen.getByRole('link', { name: /Alerts & Monitoring/i });
    expect(alertsLink).toHaveAttribute('href', '/admin/alerts');

    const supportLink = screen.getByRole('link', { name: /Support Inbox/i });
    expect(supportLink).toHaveAttribute('href', '/admin/support');

    const permsLink = screen.getByRole('link', { name: /Roles & Permissions/i });
    expect(permsLink).toHaveAttribute('href', '/admin/permissions');
  });

  it('shows the live user count on the User Management card', () => {
    render(<PlatformAdministrationSection userCount={42} />, { initialRoute: '/admin/dashboard' });
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('does not render a hardcoded "Active" health badge (false-signal regression)', () => {
    render(<PlatformAdministrationSection userCount={0} />, { initialRoute: '/admin/dashboard' });
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('does not render the meaningless "RBAC" jargon badge', () => {
    render(<PlatformAdministrationSection userCount={0} />, { initialRoute: '/admin/dashboard' });
    expect(screen.queryByText('RBAC')).not.toBeInTheDocument();
  });

  it('does not use decorative cool-gray (slate) or status (emerald) palette classes', () => {
    const { container } = render(<PlatformAdministrationSection userCount={0} />, {
      initialRoute: '/admin/dashboard',
    });
    const html = container.innerHTML;
    expect(html).not.toMatch(/slate-\d/);
    expect(html).not.toMatch(/emerald-\d/);
  });
});
