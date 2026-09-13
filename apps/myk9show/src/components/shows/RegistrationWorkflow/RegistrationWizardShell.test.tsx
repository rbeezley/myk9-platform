import { createRef } from 'react';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RegistrationWizardShell } from './RegistrationWizardShell';

describe('RegistrationWizardShell', () => {
  it('owns the sticky header, content clearance, card, and footer regions', () => {
    render(
      <RegistrationWizardShell
        rootRef={createRef<HTMLDivElement>()}
        header={<div>Wizard header</div>}
        footer={<div>Wizard footer</div>}
      >
        <div>Wizard content</div>
      </RegistrationWizardShell>
    );

    expect(screen.getByText('Wizard header')).toBeVisible();
    expect(screen.getByText('Wizard content')).toBeVisible();
    expect(screen.getByText('Wizard footer')).toBeVisible();

    const header = screen.getByTestId('registration-wizard-header');
    const main = screen.getByTestId('registration-wizard-main');
    const card = screen.getByTestId('registration-wizard-card');
    expect(header).toHaveClass('sticky', 'top-0');
    expect(main).toHaveClass('pt-[var(--app-shell-page-gap,1.5rem)]');
    expect(card).toHaveClass('min-h-[600px]', 'flex', 'flex-col');
    // No panel passed: no second column is reserved (the Receipt step).
    expect(main.className).not.toContain('lg:grid-cols-');
    expect(main.className).toContain('--registration-bottom-bar-height');
  });

  it('puts the entries panel in a second column beside the card', () => {
    render(
      <RegistrationWizardShell
        rootRef={createRef<HTMLDivElement>()}
        header={<div>Wizard header</div>}
        footer={<div>Wizard footer</div>}
        aside={<div>Your entries</div>}
      >
        <div>Wizard content</div>
      </RegistrationWizardShell>
    );

    expect(screen.getByText('Your entries')).toBeVisible();
    const main = screen.getByTestId('registration-wizard-main');
    expect(main.className).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    // The panel is a sibling of the card, not nested inside its scroll context.
    expect(screen.getByTestId('registration-wizard-card').parentElement).toBe(main);
  });

  it('publishes the measured header height for the sticky panel to clear', () => {
    render(
      <RegistrationWizardShell
        rootRef={createRef<HTMLDivElement>()}
        header={<div>Wizard header</div>}
        footer={<div>Wizard footer</div>}
        aside={<div>Your entries</div>}
      >
        <div>Wizard content</div>
      </RegistrationWizardShell>
    );

    expect(
      screen
        .getByTestId('registration-wizard-shell')
        .style.getPropertyValue('--registration-header-height')
    ).toMatch(/px$/);
  });
});
