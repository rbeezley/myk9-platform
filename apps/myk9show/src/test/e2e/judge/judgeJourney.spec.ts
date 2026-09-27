import { expect, test } from '@playwright/test';
import { signInAsJudge } from '../uat/shared/auth';

/**
 * Suite category: feature-audit.
 *
 * Judge dashboard journey (MYK9-42). Covers the judge-as-primary-actor surfaces
 * that exist today: the assignments dashboard (Today/Upcoming/Completed), the
 * personal stats page, and the shared results dashboard. Read-only — no entry
 * data is mutated.
 *
 * MYK9-850: the mock-data check-in dashboard and gate steward screen were
 * deleted (no nav path ever reached them); `/judge/check-in` now redirects
 * to the real, replication-backed ringside surface at `/at-show`.
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

  test('redirects the retired mock-data check-in bookmark to real ringside', async ({ page }) => {
    await signInAsJudge(page, '/judge/check-in');
    await expect(page).not.toHaveURL(/\/judge\/check-in/);
    await expect(page).toHaveURL(/\/at-show/);
  });

  test('redirects the retired shared results dashboard bookmark', async ({ page }) => {
    await signInAsJudge(page, '/results/dashboard');
    await expect(page).toHaveURL(/\/shows$/);

    await expect(page.getByRole('heading', { name: /shows/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
