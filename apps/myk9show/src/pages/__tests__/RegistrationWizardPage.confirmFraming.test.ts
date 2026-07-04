/**
 * Source-text regression: the wizard's last step is a post-submit RECEIPT — the
 * entry is written when the Payment step's commit button is pressed (card
 * checkout or submitShowRegistration), and the wizard only advances on success.
 *
 * So (UX walk remediation 4.A):
 *  - The last step must render honest forward exits (`ReceiptExits`), NOT a
 *    "Finish"/"Complete Registration" button that implies a submit still happens.
 *  - The Payment step's button must SAY it commits (`getPaymentSubmitLabel`),
 *    never a bare "Next" that hid the commit.
 *
 * Pinned per the repo's fs.readFileSync source-text convention so a refactor
 * can't silently reinstate the pre-submit framing or the misleading last-step
 * "Back"/"Finish".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(__dirname, '../RegistrationWizardPage.tsx'), 'utf8');

describe('RegistrationWizardPage — commit-moment framing', () => {
  it('renders honest Receipt exits on the last step, not a commit button', () => {
    expect(source).toContain('ReceiptExits');
    expect(source).not.toContain('Complete Registration');
    // The old misleading last-step footer button is gone.
    expect(source).not.toContain("isLastStep ? 'Finish'");
  });

  it('labels the Payment step button as the honest, method-aware commit', () => {
    expect(source).toContain('getPaymentSubmitLabel(registrationData.paymentMethod)');
  });
});
