import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const registrationSpecDir = join(process.cwd(), 'src/test/e2e/registration');

const maintainedRegistrationSpecs = [
  {
    file: 'exhibitorSelfRegistration.spec.ts',
    purpose: 'documents the current public exhibitor-registration placeholder',
  },
  {
    file: 'secretaryExistingUsers.spec.ts',
    purpose: 'covers secretary mail-in registration for existing users and dogs',
  },
  {
    file: 'secretaryNewUsers.spec.ts',
    purpose: 'documents current secretary new-user creation availability',
  },
  {
    file: 'singleDogSingleClass.spec.ts',
    purpose: 'covers the narrow single-dog secretary registration path',
  },
];

test.describe('Registration E2E inventory', () => {
  test('tracks the maintained registration browser specs', () => {
    for (const spec of maintainedRegistrationSpecs) {
      const specPath = join(registrationSpecDir, spec.file);
      expect(existsSync(specPath), `${spec.file}: ${spec.purpose}`).toBe(true);

      const source = readFileSync(specPath, 'utf8');
      expect(source, `${spec.file} should contain at least one Playwright test`).toMatch(
        /\btest(?:\.describe)?\s*\(/
      );
    }
  });

  test('does not revive the retired fake show-123 integration flow', () => {
    const source = readFileSync(join(registrationSpecDir, 'index.spec.ts'), 'utf8');
    const retiredTokens = [
      ['/shows/', 'show-123', '/register'].join(''),
      ['dog', 'card', '1'].join('-'),
      ['registration', 'step', 'dog', 'selection'].join('-'),
    ];

    for (const token of retiredTokens) {
      expect(source).not.toContain(token);
    }
  });
});
