import { createRef } from 'react';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RegistrationWizardShell } from './RegistrationWizardShell';

describe('RegistrationWizardShell', () => {
  it('owns the sticky header, content clearance, card, and footer regions', () => {
    render(
      <RegistrationWizardShell
        rootRef={createRef<HTMLDivElement>()}
        isInsideSidebar={false}
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
  });
});
