import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { APP_SHELL_PAGE_CLASS } from './appShellContract';
import { AppShellPage } from './AppShell';

describe('AppShellPage', () => {
  it('marks the page surface and uses the shared spacing contract', () => {
    render(
      <AppShellPage maxWidthClass="max-w-4xl">
        <p>Content</p>
      </AppShellPage>
    );

    const page = screen.getByTestId('app-shell-page');
    expect(page).toHaveAttribute('data-layout', 'app-shell-page');
    expect(page).toHaveClass('max-w-4xl', 'mx-auto');
    for (const className of APP_SHELL_PAGE_CLASS.split(' ')) {
      expect(page).toHaveClass(className);
    }
  });
});
