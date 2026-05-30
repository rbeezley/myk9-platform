import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import CredentialsHelpPage from './CredentialsHelpPage';

describe('CredentialsHelpPage', () => {
  it('renders the page heading', () => {
    render(<CredentialsHelpPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /email or passcode\?/i }),
    ).toBeInTheDocument();
  });

  it('explains both credential paths', () => {
    render(<CredentialsHelpPage />);
    expect(
      screen.getByRole('heading', { level: 2, name: /your account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /a show passcode/i }),
    ).toBeInTheDocument();
  });

  it('lists all four passcode roles', () => {
    render(<CredentialsHelpPage />);
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Judge')).toBeInTheDocument();
    expect(screen.getByText('Steward')).toBeInTheDocument();
    expect(screen.getByText('Exhibitor')).toBeInTheDocument();
  });

  it('describes the suffix as a show-specific secret code', () => {
    render(<CredentialsHelpPage />);
    expect(screen.getByText(/show-specific secret code/i)).toBeInTheDocument();
    expect(screen.queryByText(/for show a260/i)).not.toBeInTheDocument();
  });
});
