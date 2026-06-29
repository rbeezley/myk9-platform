/**
 * Source-text regression: the wizard's last step is a post-submit receipt — the
 * entry is written on the Payment step's Next (card checkout or
 * submitShowRegistration), and the wizard only advances to confirmation on
 * success. So the footer button must read "Finish" (it just closes the wizard),
 * NOT "Complete Registration", which implies the submit still has to happen
 * here. Pinned per the repo's fs.readFileSync source-text convention so a
 * refactor can't silently reinstate the pre-submit framing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(__dirname, '../RegistrationWizardPage.tsx'), 'utf8');

describe('RegistrationWizardPage — confirmation-step framing', () => {
  it('labels the last-step footer button "Finish", not "Complete Registration"', () => {
    expect(source).toContain("isLastStep ? 'Finish'");
    expect(source).not.toContain('Complete Registration');
  });
});
