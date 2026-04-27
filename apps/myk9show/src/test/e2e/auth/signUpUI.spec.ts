import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * UI tests for the sign-up flow.
 *
 * Strategy:
 *   - Use unique timestamped emails so each run is independent.
 *   - Never use waitForTimeout — all waits are waitForURL or waitForResponse.
 *   - The spec verifies up to the "Check your email" confirmation screen;
 *     it cannot click the email link in a real mailbox.
 *
 * Auth assumption: sign-up does NOT require an existing session.
 *
 * DB note: migration 165 ensures the on_auth_user_created trigger sets
 * agreed_to_tos_at; the JS signUp() call no longer inserts into people.
 */

test.describe.configure({ mode: 'serial' });

const RUN_ID = Date.now();

async function gotoSignUp(page: Page) {
  await page.goto('/sign-up', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
}

test.describe('Sign-up page — initial state', () => {
  test('renders form with TOS gate in place', async ({ page }) => {
    await gotoSignUp(page);

    // Exhibitor is pre-checked; other roles are not
    await expect(page.getByRole('checkbox', { name: 'Exhibitor (I show dogs)' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Club officer / show host' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Show secretary' })).not.toBeChecked();

    // TOS is unchecked; submit + Google buttons are disabled
    await expect(
      page.getByRole('checkbox', { name: 'I agree to the Terms of Service and Privacy Policy' })
    ).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();

    // Terms and Privacy links present
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();

    // "Already have an account?" → sign-in link (lowercase distinguishes from nav "Sign In")
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('enables submit after agreeing to TOS', async ({ page }) => {
    await gotoSignUp(page);
    await page
      .getByRole('checkbox', { name: 'I agree to the Terms of Service and Privacy Policy' })
      .check();
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});

test.describe('Sign-up form — validation', () => {
  test('shows error on password mismatch', async ({ page }) => {
    await gotoSignUp(page);

    await page.getByRole('textbox', { name: 'First name' }).fill('Test');
    await page.getByRole('textbox', { name: 'Last name' }).fill('User');
    await page.getByRole('textbox', { name: 'Email address' }).fill(`mismatch-${RUN_ID}@myk9t.com`);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('StrongPass99!');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('DifferentPass99!');
    await page
      .getByRole('checkbox', { name: 'I agree to the Terms of Service and Privacy Policy' })
      .check();

    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});

test.describe('Sign-up form — happy path', () => {
  test('creates account and shows email confirmation screen', async ({ page }) => {
    const email = `e2e-signup-${randomUUID()}@myk9t.com`;

    // Mock the Supabase signup endpoint so the test is deterministic and never
    // triggers the real email rate limit (Supabase throttles test runs quickly).
    // The mock returns a minimal valid user payload; session: null signals that
    // email confirmation is required, which is what triggers the confirmation UI.
    await page.route('**/auth/v1/signup**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: randomUUID(),
          aud: 'authenticated',
          role: 'authenticated',
          email,
          email_confirmed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { first_name: 'E2E', last_name: 'Tester' },
          identities: [],
        }),
      })
    );

    await gotoSignUp(page);

    await page.getByRole('textbox', { name: 'First name' }).fill('E2E');
    await page.getByRole('textbox', { name: 'Last name' }).fill('Tester');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('Wr9xK!mP2qL7');
    await page.getByRole('textbox', { name: 'Confirm password' }).fill('Wr9xK!mP2qL7');
    await page
      .getByRole('checkbox', { name: 'I agree to the Terms of Service and Privacy Policy' })
      .check();

    await page.getByRole('button', { name: 'Sign up' }).click();

    // Confirmation screen
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(email)).toBeVisible();
    await expect(
      page.getByText('Click the link in the email to activate your account')
    ).toBeVisible();

    // "Back to sign in" navigates correctly
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
