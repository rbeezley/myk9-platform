import { expect, test, type Page } from '@playwright/test';
import {
  ROLE_JOURNEY_MATRIX,
  ROLE_JOURNEY_THEMES,
  ROLE_JOURNEY_VIEWPORTS,
  resolveRoleJourneyPath,
  type RoleJourneyAuthUser,
  type RoleJourneyScenario,
  type RoleJourneyTheme,
  type RoleJourneyViewport,
} from './roleJourneyMatrix';
import {
  TEST_USERS,
  signInAsAdmin,
  signInAsExhibitor,
  signInAsJudge,
  signInAsSecretary,
  type TestUser,
} from '../helpers/testUsers';
import { LIVE_SECRETARY_SHOW_ID, LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';

/**
 * Suite category: feature-audit.
 *
 * Data-driven role/viewport/theme coverage for MYK9-17. This matrix stays out
 * of PR smoke because it signs in four roles and captures targeted baselines;
 * run it when changing cross-role UX, layouts, or visual tokens.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const PATH_PARAMS = {
  registrationShowId: LIVE_REGISTRATION_SHOW_ID,
  secretaryShowId: LIVE_SECRETARY_SHOW_ID,
};

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function signInForScenario(
  page: Page,
  authUser: RoleJourneyAuthUser,
  returnTo: string
): Promise<TestUser> {
  const user = TEST_USERS[authUser];
  switch (authUser) {
    case 'DEMO_EXHIBITOR':
      await signInAsExhibitor(page, returnTo);
      break;
    case 'SECRETARY':
      await signInAsSecretary(page, returnTo);
      break;
    case 'JUDGE':
      await signInAsJudge(page, returnTo);
      break;
    case 'SITE_ADMIN':
      await signInAsAdmin(page, returnTo);
      break;
  }
  return user;
}

async function configureViewportAndTheme(
  page: Page,
  viewport: RoleJourneyViewport,
  theme: RoleJourneyTheme
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(
    ({ colorScheme }) => {
      localStorage.setItem('myK9Q_settings', JSON.stringify({ theme: colorScheme }));
    },
    { colorScheme: theme }
  );
}

async function assertRouteHealth(page: Page, errors: string[], routeLabel: string) {
  await expect
    .poll(async () => (await page.locator('body').innerText()).trim().length, {
      message: `${routeLabel}: page did not render meaningful content`,
      timeout: 20_000,
    })
    .toBeGreaterThan(20);

  await expect(page).not.toHaveURL(/\/sign-in/);

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  );
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(overflow, `${routeLabel}: horizontal overflow at ${viewportWidth}px`).toBe(0);
  expect(errors, `${routeLabel}: browser errors`).toEqual([]);
}

async function assertExhibitorStates(page: Page) {
  const next = page.getByRole('button', { name: /^Next$/ });
  await expect(next).toBeDisabled();
  await expect(page.getByRole('button', { name: /Load Draft/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Save Draft' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Draft Title')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
}

async function assertSecretaryStates(page: Page) {
  const waitlist = page.getByRole('tab', { name: 'Waitlist', exact: true });
  await expect(waitlist).toBeVisible();
  await waitlist.click();
  await expect(waitlist).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Entries', exact: true }).click();
  await expect(page.getByText('Total Entries', { exact: true })).toBeVisible();

  await page.goto(`/shows/${LIVE_SECRETARY_SHOW_ID}/show-desk`, {
    waitUntil: 'domcontentloaded',
  });
  const toolsPanelTrigger = page.getByRole('button', { name: /open tools panel/i });
  await expect(toolsPanelTrigger).toBeVisible();
  await toolsPanelTrigger.click();
  const toolsPanel = page.getByRole('dialog', { name: /show desk tools/i });
  await expect(toolsPanel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolsPanel).not.toBeVisible();
}

async function assertJudgeStates(page: Page) {
  await expect(page.getByRole('heading', { name: 'Check-In Management' })).toBeVisible();
  await expect(
    page.getByText('Manage exhibitor check-in status for your assigned rings', { exact: true })
  ).toBeVisible();
}

async function runScenario(
  page: Page,
  scenario: RoleJourneyScenario,
  viewport: RoleJourneyViewport,
  theme: RoleJourneyTheme,
  testInfo: { outputPath: (path: string) => string }
) {
  await configureViewportAndTheme(page, viewport, theme);
  const firstRoute = resolveRoleJourneyPath(scenario.routes[0].pathTemplate, PATH_PARAMS);
  const user = TEST_USERS[scenario.authUser];
  if (!user.email || !user.password) {
    test.skip(true, `${scenario.roleLabel} credentials are not configured`);
  }

  const errors = captureBrowserErrors(page);
  await signInForScenario(page, scenario.authUser, firstRoute);
  errors.length = 0;

  for (const route of scenario.routes) {
    const path = resolveRoleJourneyPath(route.pathTemplate, PATH_PARAMS);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await assertRouteHealth(page, errors, `${scenario.id}/${route.id}`);
    errors.length = 0;
  }

  switch (scenario.id) {
    case 'exhibitor-entry':
      await assertExhibitorStates(page);
      await expect(page.getByTestId('registration-wizard-card')).toHaveScreenshot(
        `exhibitor-entry-${viewport.id}-${theme}.png`,
        { animations: 'disabled' }
      );
      break;
    case 'secretary-management':
      await assertSecretaryStates(page);
      break;
    case 'judge-steward-check-in':
      await assertJudgeStates(page);
      break;
    case 'admin-support':
      await expect(page.getByRole('heading').first()).toBeVisible();
      break;
  }

  await page.screenshot({
    path: testInfo.outputPath(`${scenario.id}-${viewport.id}-${theme}.png`),
    fullPage: true,
  });
  expect(errors, `${scenario.id}: interaction browser errors`).toEqual([]);
}

for (const scenario of ROLE_JOURNEY_MATRIX) {
  test.describe(`${scenario.roleLabel}: ${scenario.goal}`, () => {
    for (const viewport of ROLE_JOURNEY_VIEWPORTS) {
      for (const theme of ROLE_JOURNEY_THEMES) {
        test(`${viewport.id} / ${theme}`, async ({ page }, testInfo) => {
          await runScenario(page, scenario, viewport, theme, testInfo);
        });
      }
    }
  });
}
