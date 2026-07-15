import React from 'react';

interface RegistrationWizardShellProps {
  children: React.ReactNode;
  footer: React.ReactNode;
  header: React.ReactNode;
  isInsideSidebar: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Structural contract for the registration wizard.
 *
 * The header is sticky inside the page's own scroll context. The stepper is
 * part of that header, so the content card follows the fully rendered header
 * in normal flow and only uses the shared app-shell gap below it. Step content
 * owns content layout; it must not add margins to compensate for the header.
 */
export function RegistrationWizardShell({
  children,
  footer,
  header,
  isInsideSidebar,
  rootRef,
}: RegistrationWizardShellProps) {
  return (
    <div
      ref={rootRef}
      data-layout="registration-wizard-shell"
      data-testid="registration-wizard-shell"
      className={isInsideSidebar ? 'bg-background' : 'min-h-screen bg-background'}
    >
      <header
        data-layout="registration-wizard-header"
        data-testid="registration-wizard-header"
        className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xl"
      >
        {header}
      </header>

      <div
        data-layout="registration-wizard-main"
        data-testid="registration-wizard-main"
        className="container mx-auto max-w-7xl px-4 pb-[var(--app-shell-page-bottom,2rem)] pt-[var(--app-shell-page-gap,1.5rem)] sm:px-6"
      >
        <section
          data-layout="registration-wizard-card"
          data-testid="registration-wizard-card"
          className="flex min-h-[600px] flex-col rounded-2xl border border-border bg-card shadow-sm"
        >
          <div className="flex-1 p-4 sm:p-8">{children}</div>
          <div className="relative px-4 pb-6 sm:px-8 sm:pb-8">{footer}</div>
        </section>
      </div>
    </div>
  );
}
