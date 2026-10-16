import { createRef } from 'react';
import { act, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RegistrationWizardShell } from './RegistrationWizardShell';
import { useRegistrationShellChrome } from './RegistrationShellChrome';

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
    // Where it sticks (top, collapse) is geometry: registrationWizardStickyChrome.spec.ts.
    expect(header).toHaveClass('sticky');
    expect(main).toHaveClass('pt-[var(--app-shell-page-gap,1.5rem)]');
    expect(card).toHaveClass('min-h-[600px]', 'flex', 'flex-col');
    // No panel passed: no second column is reserved (the Receipt step).
    expect(main.className).not.toContain('lg:grid-cols-');
    // The phone bar is sticky inside the wizard's own scrollport and takes flow
    // space at the end of the step, so no reserved-height variable exists.
    expect(main.className).not.toContain('--registration-bottom-bar-height');
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

  it('publishes the bottom bar height a child reports, for the scrollport to clear', () => {
    const rootRef = createRef<HTMLDivElement>();
    function Bar() {
      const { setBarHeight } = useRegistrationShellChrome();
      return <button onClick={() => setBarHeight(72)}>report</button>;
    }
    render(
      <RegistrationWizardShell
        rootRef={rootRef}
        header={<div>Wizard header</div>}
        footer={<div>Wizard footer</div>}
        aside={<Bar />}
      >
        <div>Wizard content</div>
      </RegistrationWizardShell>
    );
    const root = screen.getByTestId('registration-wizard-shell');
    expect(root.style.getPropertyValue('--registration-bar-height')).toBe('');

    act(() => screen.getByRole('button', { name: 'report' }).click());

    expect(root.style.getPropertyValue('--registration-bar-height')).toBe('72px');
  });
});
