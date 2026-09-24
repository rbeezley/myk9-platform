import { Page, expect } from '@playwright/test';
import { logger } from '@/services/LoggingService';
import { TEST_USERS, type TestUser, signIn as performSignIn } from './testUsers';

type TestRole = 'admin' | 'secretary' | 'user' | 'judge';

const ROLE_USERS: Record<TestRole, TestUser> = {
  admin: TEST_USERS.SITE_ADMIN,
  secretary: TEST_USERS.SECRETARY,
  // DEMO_EXHIBITOR is the canonical env-backed exhibitor login.
  user: TEST_USERS.DEMO_EXHIBITOR,
  judge: TEST_USERS.JUDGE,
};

export class TestSetup {
  constructor(protected page: Page) {}

  /**
   * Sign in as a test user
   */
  async signIn(role: TestRole = 'admin', returnTo = '/') {
    logger.debug(`Signing in as ${role}...`, 'app', {});

    const creds = ROLE_USERS[role];
    if (!creds.password) {
      throw new Error(`Missing password for ${role} test user ${creds.email}`);
    }

    logger.debug(`Using credentials: ${creds.email}`, 'app', {});

    // Drive the real SmartSignInPage flow via the shared helper (credential →
    // Continue → password → submit → wait off /sign-in). performSignIn already
    // throws on an auth-error banner and asserts navigation off /sign-in, so a
    // successful return means this user is authenticated.
    await performSignIn(this.page, creds.email, creds.password, returnTo);

    // Confirm the *correct* user is in session by reading Supabase's persisted
    // auth token from localStorage. This works against both the dev server and
    // the built `vite preview` target used in CI — unlike importing the app's
    // TS source by path (`/src/...`), which only resolves under the dev server.
    await expect
      .poll(
        async () =>
          await this.page.evaluate(() => {
            for (let i = 0; i < localStorage.length; i += 1) {
              const key = localStorage.key(i);
              if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
              try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : null;
                const email = parsed?.user?.email ?? parsed?.currentSession?.user?.email;
                if (email) return email as string;
              } catch {
                // Non-JSON or partial write mid-poll; try the next key.
              }
            }
            return null;
          }),
        { timeout: 15000 }
      )
      .toBe(creds.email);

    await expect(this.page).not.toHaveURL(/\/sign-in/);

    const finalUrl = this.page.url();
    logger.debug(`Successfully signed in! Final URL: ${finalUrl}`, 'app', {});
  }

  /**
   * Navigate to admin template management
   */
  async goToTemplateManagement() {
    await this.page.goto('/admin/templates');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Clear all test data
   */
  async clearTestData() {
    // Clear localStorage with error handling for cross-origin issues
    await this.page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Handle cases where localStorage is not accessible (like file:// protocol or cross-origin)
      }
    });
  }
}
