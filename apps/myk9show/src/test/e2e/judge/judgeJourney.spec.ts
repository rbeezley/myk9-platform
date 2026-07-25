import { expect, test } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';

/**
 * Suite category: feature-audit.
 *
 * Judge dashboard journey (MYK9-42). Covers the judge-as-primary-actor surfaces
 * that exist today: the assignments dashboard (Today/Upcoming/Completed), the
 * personal stats page, check-in, and the shared results dashboard. Read-only —
 * no entry data is mutated.
 *
 * NOT covered here — "assignment acceptance": judge_assignments supports an
 * 'invited' status (see assignmentStatus.ts ACTIVE_JUDGE_ASSIGNMENT_STATUSES), but
 * no UI anywhere accepts/declines an invited assignment; every seeded
 * assignment for e2e-judge is pre-'confirmed'. This is a feature gap, not a
 * seed gap — see SUMMARY (MYK9-42) for detail. "Judge book" and "results
 * sign-off" are represented by the at-show scoresheet's Confirm & Submit step,
 * already covered by show/atShowJudgeScoring.spec.ts (currently test.fixme on
 * a real RLS read gap — see that file).
 */

test.describe('Judge dashboard journey', () => {
  test('shows judging assignments grouped by Today/Upcoming/Completed', async ({ page }) => {
    await signInAsJudge(page, '/judge/dashboard');
    await expect(page).toHaveURL(/\/judge\/dashboard/);

    await expect(page.getByRole('heading', { name: 'Judging Assignments' })).toBeVisible({
      timeout: 15_000,
    });

    // Tabs render — the dashboard buckets assignments client-side by date.
    const todayTab = page.getByRole('tab', { name: /Today/i });
    const upcomingTab = page.getByRole('tab', { name: /Upcoming/i });
    const completedTab = page.getByRole('tab', { name: /Completed/i });
    await expect(todayTab).toBeVisible();
    await expect(upcomingTab).toBeVisible();
    await expect(completedTab).toBeVisible();

    await upcomingTab.click();
    await expect(upcomingTab).toHaveAttribute('aria-selected', 'true');

    await completedTab.click();
    await expect(completedTab).toHaveAttribute('aria-selected', 'true');
  });

  test('navigates to My Stats and shows assignment status', async ({ page }) => {
    await signInAsJudge(page, '/judge/stats');
    await expect(page).toHaveURL(/\/judge\/stats/);

    await expect(page.getByRole('heading', { name: 'My Stats', level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Assignment Status')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming Assignments' })).toBeVisible();
  });

  test('reaches the judge check-in dashboard', async ({ page }) => {
    await signInAsJudge(page, '/judge/check-in');
    await expect(page).toHaveURL(/\/judge\/check-in/);

    // The check-in dashboard is also used by stewards; assert the app shell
    // rendered rather than a specific heading string, which is more likely to
    // drift under redesign.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();
  });

  test('reaches the shared results dashboard', async ({ page }) => {
    await signInAsJudge(page, '/results/dashboard');
    await expect(page).toHaveURL(/\/results\/dashboard/);

    await expect(page.getByRole('heading', { name: 'Result Entry System', level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });
});
