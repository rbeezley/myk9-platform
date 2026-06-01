import { render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { MyK9QSunsetApp } from './MyK9QSunsetApp';

describe('MyK9QSunsetApp', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('points people to myK9Show and preserves the passcode query string', () => {
    window.history.replaceState({}, '', '/score?code=eabcd&ring=2');

    render(<MyK9QSunsetApp />);

    expect(
      screen.getByRole('heading', { name: 'myK9Q has moved into myK9Show.' })
    ).toBeInTheDocument();
    expect(screen.getByText(/allow notifications again in myK9Show/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open myK9Show' })).toHaveAttribute(
      'href',
      'https://myk9-platform-myk9show.vercel.app/at-show?code=eabcd&ring=2'
    );
  });
});
