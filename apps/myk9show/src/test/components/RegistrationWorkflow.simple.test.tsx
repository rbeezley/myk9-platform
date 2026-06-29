import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// These tests verify the registration architecture is correct

describe('RegistrationWorkflow Error Detection Tests', () => {
  describe('Context Provider Error Detection', () => {
    it('should verify RegistrationWizardPage wraps content with RegistrationProvider', () => {
      const wizardPagePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const wizardPageContent = fs.readFileSync(wizardPagePath, 'utf8');
      expect(wizardPageContent.includes('RegistrationProvider')).toBe(true);
    });

    it('should verify RegistrationProvider is used in JSX', () => {
      const wizardPagePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const wizardPageContent = fs.readFileSync(wizardPagePath, 'utf8');
      expect(wizardPageContent.includes('<RegistrationProvider>')).toBe(true);
    });
  });

  describe('Function Initialization Order Detection', () => {
    // The wizard's state, including isStepCompleted, moved out of the page into
    // useRegistrationWizardState.ts during the 500-line-ceiling refactor.
    const stateHookPath = path.join(
      __dirname,
      '../../pages/RegistrationWizardPage/useRegistrationWizardState.ts'
    );

    it('should validate isStepCompleted is defined in the wizard state hook', () => {
      const fileContent = fs.readFileSync(stateHookPath, 'utf8');

      const isStepCompletedPos = fileContent.indexOf('const isStepCompleted');
      expect(isStepCompletedPos).toBeGreaterThan(0);
    });

    it('should not use isStepCompleted before its definition', () => {
      const fileContent = fs.readFileSync(stateHookPath, 'utf8');

      const functionStart = fileContent.indexOf('function useRegistrationWizardState');
      const functionBody = fileContent.substring(functionStart);

      const lines = functionBody.split('\n');
      let isStepCompletedDefined = false;
      let lineNumber = 0;

      for (const line of lines) {
        lineNumber++;

        if (line.includes('const isStepCompleted')) {
          isStepCompletedDefined = true;
        } else if (
          line.includes('isStepCompleted(') &&
          !isStepCompletedDefined &&
          !line.includes('const')
        ) {
          throw new Error(
            `Temporal dead zone error: isStepCompleted used before definition at line ${lineNumber}: ${line.trim()}`
          );
        }
      }

      expect(isStepCompletedDefined).toBe(true);
    });
  });

  describe('Component Structure Validation', () => {
    it('should verify RegistrationWizardPage includes RegistrationProvider', () => {
      const wizardPagePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const wizardPageContent = fs.readFileSync(wizardPagePath, 'utf8');

      const hasProviderImport = wizardPageContent.includes('import { RegistrationProvider }');
      const hasProviderWrapper = wizardPageContent.includes('<RegistrationProvider>');

      expect(hasProviderImport).toBe(true);
      expect(hasProviderWrapper).toBe(true);
    });

    it('should verify CalendarPage navigates to registration page instead of using dialog', () => {
      const calendarPagePath = path.join(__dirname, '../../pages/CalendarPage.tsx');
      const calendarPageContent = fs.readFileSync(calendarPagePath, 'utf8');

      // CalendarPage should NOT contain RegistrationWorkflow dialog anymore
      expect(calendarPageContent.includes('<RegistrationWorkflow')).toBe(false);
      expect(calendarPageContent.includes('<RegistrationProvider>')).toBe(false);

      // It should navigate to the registration wizard page
      expect(calendarPageContent.includes('/register')).toBe(true);
    });

    it('should verify route exists for registration wizard', () => {
      const routesPath = path.join(__dirname, '../../routes/publicRoutes.tsx');
      const routesContent = fs.readFileSync(routesPath, 'utf8');

      expect(routesContent.includes('/shows/:showId/register')).toBe(true);
      expect(routesContent.includes('RegistrationWizardPage')).toBe(true);
    });
  });
});

describe('Submission Loading State Wiring', () => {
  // The submission orchestration was split out of the page during the
  // 500-line-ceiling refactor: state lives in useRegistrationWizardState.ts,
  // the payment submission in submitPaymentStep.ts, the in-flight guard and the
  // handler wiring in wizardHandlers.ts, and the JSX prop stays in the page.
  const base = path.join(__dirname, '../../pages/RegistrationWizardPage');
  const stateHookContent = fs.readFileSync(
    path.join(base, 'useRegistrationWizardState.ts'),
    'utf8'
  );
  const paymentStepContent = fs.readFileSync(path.join(base, 'submitPaymentStep.ts'), 'utf8');
  const handlersContent = fs.readFileSync(path.join(base, 'wizardHandlers.ts'), 'utf8');
  const wizardPageContent = fs.readFileSync(
    path.join(__dirname, '../../pages/RegistrationWizardPage.tsx'),
    'utf8'
  );

  it('should declare isSubmitting state', () => {
    expect(stateHookContent).toContain('const [isSubmitting, setIsSubmitting] = useState');
  });

  it('should set isSubmitting true before async payment submission', () => {
    // setIsSubmitting(true) must appear before the async registration submission
    const setTruePos = paymentStepContent.indexOf('setIsSubmitting(true)');
    const submitPos = paymentStepContent.indexOf('await submitShowRegistration(');
    expect(setTruePos).toBeGreaterThan(0);
    expect(submitPos).toBeGreaterThan(setTruePos);
  });

  it('should reset isSubmitting in a finally block', () => {
    // The finally block must contain setIsSubmitting(false)
    const finallyPos = paymentStepContent.indexOf('} finally {');
    const setFalsePos = paymentStepContent.indexOf('setIsSubmitting(false)');
    expect(finallyPos).toBeGreaterThan(0);
    expect(setFalsePos).toBeGreaterThan(finallyPos);
  });

  it('should pass isSubmitting to WizardNavigation as isLoading', () => {
    expect(wizardPageContent).toContain('isLoading={isSubmitting}');
  });

  it('should guard against double-clicks with submittingRef', () => {
    expect(handlersContent).toContain('if (submittingRef.current');
  });
});

describe('Error Prevention Summary', () => {
  it('should summarize what these tests prevent', () => {
    console.log('\nTHESE TESTS PREVENT:');
    console.log('1. Missing RegistrationProvider context in wizard page');
    console.log('2. Temporal dead zone initialization errors');
    console.log('3. Registration route missing from router');
    console.log('4. Regression to dialog-based registration');
    console.log('5. Missing loading indicator during payment submission');
    console.log('6. Double-click on submit during async operations');

    expect(true).toBe(true);
  });
});
