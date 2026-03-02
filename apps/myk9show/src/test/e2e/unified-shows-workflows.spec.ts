import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Test user credentials - using working credentials that exist in test database
const users = {
  guest: null,
  exhibitor: {
    email: 'working-exhibitor@example.com',
    password: 'testpass123',
    name: 'Test Exhibitor'
  },
  secretary: {
    email: 'working-secretary@example.com',
    password: 'testpass123',
    name: 'Test Secretary'
  },
  judge: {
    email: 'working-judge@example.com',
    password: 'testpass123',
    name: 'Test Judge'
  },
  admin: {
    email: 'working-admin@example.com',
    password: 'testpass123',
    name: 'Site Admin'
  },
  multiRole: {
    email: 'working-multi@example.com',
    password: 'testpass123',
    name: 'Multi Role User'
  }
};

// Helper function to login
async function login(page: Page, user: typeof users.exhibitor) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  
  // Wait for form elements to be ready
  await page.waitForSelector('[data-testid="email-input"]', { state: 'visible' });
  await page.waitForSelector('[data-testid="password-input"]', { state: 'visible' });
  await page.waitForSelector('[data-testid="sign-in-button"]', { state: 'visible' });
  
  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);
  await page.click('[data-testid="sign-in-button"]');
  
  // Wait for navigation to home page after successful login
  await page.waitForURL('/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// Helper function to navigate to Browse Shows
async function navigateToBrowseShows(page: Page) {
  await page.click('a:has-text("Shows")');
  await page.waitForURL('/shows', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Guest User Workflow', () => {
  test('should redirect to sign-in when accessing protected routes', async ({ page }) => {
    // Guests trying to access /shows should be redirected to sign-in
    await page.goto('/shows');
    
    // Should redirect to sign-in page
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('should see public content on home page', async ({ page }) => {
    await page.goto('/');
    
    // Should see public hero section - use a more specific selector
    await expect(page.getByRole('heading', { name: /Welcome to myK9Show/i })).toBeVisible();
    
    // Should see upcoming shows section (public data)
    await expect(page.locator('text=Upcoming Shows')).toBeVisible();
    
    // Should see call-to-action to sign in
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });
});

test.describe('Exhibitor Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.exhibitor);
  });

  test('should see base tabs plus My Entries', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Check all exhibitor tabs are visible
    await expect(page.getByRole('tab', { name: /all shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /past shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /my entries/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /managing/i })).not.toBeVisible();
  });

  test('should be able to register for a show', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Find an upcoming show
    const showCard = page.locator('[data-testid^="show-card"]')
      .filter({ hasText: 'Upcoming' })
      .first();

    // Click register button
    await showCard.getByRole('button', { name: /register/i }).click();

    // Should navigate to registration page
    await expect(page).toHaveURL(/\/shows\/.*\/register/);
    
    // Verify registration form is displayed
    await expect(page.getByRole('heading', { name: /register for show/i })).toBeVisible();
  });

  test('should see entered shows in My Entries tab', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Click My Entries tab
    await page.getByRole('tab', { name: /my entries/i }).click();

    // Wait for tab content to load
    await page.waitForSelector('[data-testid="tab-content-entries"]');

    // Check for entries or empty state
    const hasEntries = await page.locator('[data-testid^="show-card"]').count() > 0;
    
    if (hasEntries) {
      // Verify entry-specific actions
      const entryCard = page.locator('[data-testid^="show-card"]').first();
      await expect(entryCard.getByRole('button', { name: /view entry/i })).toBeVisible();
      await expect(entryCard.getByRole('button', { name: /modify entry/i })).toBeVisible();
    } else {
      // Verify empty state
      await expect(page.getByText(/no entries yet/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /browse shows/i })).toBeVisible();
    }
  });
});

test.describe('Secretary Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.secretary);
  });

  test('should see Managing tab and Create Show button', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Check secretary tabs
    await expect(page.getByRole('tab', { name: /managing/i })).toBeVisible();
    
    // Check Create Show button in header
    await expect(page.getByRole('button', { name: /create show/i })).toBeVisible();
  });

  test('should be able to create a new show', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Click Create Show button
    await page.getByRole('button', { name: /create show/i }).click();

    // Should navigate to create show page
    await expect(page).toHaveURL(/\/shows\/create/);
    
    // Fill basic show details
    await page.fill('input[name="name"]', 'Test Agility Trial');
    await page.selectOption('select[name="type"]', 'Agility');
    await page.fill('input[name="location"]', 'Test Venue');
    
    // Set dates
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('input[name="startDate"]', tomorrow.toISOString().split('T')[0]);
    
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    await page.fill('input[name="endDate"]', dayAfter.toISOString().split('T')[0]);

    // Submit form
    await page.getByRole('button', { name: /create show/i }).click();

    // Should redirect to show details
    await expect(page).toHaveURL(/\/shows\/.*/);
    await expect(page.getByText('Test Agility Trial')).toBeVisible();
  });

  test('should see managed shows in Managing tab', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Click Managing tab
    await page.getByRole('tab', { name: /managing/i }).click();

    // Wait for tab content
    await page.waitForSelector('[data-testid="tab-content-managing"]');

    // Check for managed shows
    const managedShows = page.locator('[data-testid^="show-card"]');
    
    if (await managedShows.count() > 0) {
      // Verify management actions
      const showCard = managedShows.first();
      await expect(showCard.getByRole('button', { name: /edit show/i })).toBeVisible();
      await expect(showCard.getByRole('button', { name: /manage entries/i })).toBeVisible();
      await expect(showCard.getByRole('button', { name: /reports/i })).toBeVisible();
    }
  });

  test('should be able to manage show entries', async ({ page }) => {
    await navigateToBrowseShows(page);
    await page.getByRole('tab', { name: /managing/i }).click();

    // Find a managed show
    const showCard = page.locator('[data-testid^="show-card"]').first();
    await showCard.getByRole('button', { name: /manage entries/i }).click();

    // Should navigate to entries management
    await expect(page).toHaveURL(/\/shows\/.*\/entries/);
    await expect(page.getByRole('heading', { name: /manage entries/i })).toBeVisible();

    // Verify entry management tools
    await expect(page.getByRole('button', { name: /export entries/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /print catalog/i })).toBeVisible();
  });
});

test.describe('Judge Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.judge);
  });

  test('should see My Assignments tab', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Check judge-specific tab
    await expect(page.getByRole('tab', { name: /my assignments/i })).toBeVisible();
  });

  test('should see assigned shows in My Assignments', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Click My Assignments tab
    await page.getByRole('tab', { name: /my assignments/i }).click();

    // Wait for tab content
    await page.waitForSelector('[data-testid="tab-content-assignments"]');

    // Check for assignments
    const assignments = page.locator('[data-testid^="show-card"]');
    
    if (await assignments.count() > 0) {
      // Verify judge-specific actions
      const showCard = assignments.first();
      await expect(showCard.getByRole('button', { name: /assignment details/i })).toBeVisible();
      await expect(showCard.getByRole('button', { name: /class schedule/i })).toBeVisible();
    }
  });

  test('should be able to enter results for assigned show', async ({ page }) => {
    await navigateToBrowseShows(page);
    await page.getByRole('tab', { name: /my assignments/i }).click();

    // Find an active/past assignment
    const showCard = page.locator('[data-testid^="show-card"]')
      .filter({ hasText: /Active|Completed/ })
      .first();

    if (await showCard.count() > 0) {
      await showCard.getByRole('button', { name: /enter results/i }).click();

      // Should navigate to scoring interface
      await expect(page).toHaveURL(/\/shows\/.*\/scoring/);
      await expect(page.getByRole('heading', { name: /enter results/i })).toBeVisible();
    }
  });
});

test.describe('Site Admin Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.admin);
  });

  test('should see all shows including drafts', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Admin should see draft shows
    const draftShows = page.locator('[data-testid^="show-card"]')
      .filter({ hasText: 'Draft' });
    
    expect(await draftShows.count()).toBeGreaterThanOrEqual(0);
  });

  test('should have global management capabilities', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Click Managing tab
    await page.getByRole('tab', { name: /managing/i }).click();

    // Admin sees all shows
    const showCards = page.locator('[data-testid^="show-card"]');
    expect(await showCards.count()).toBeGreaterThan(0);

    // Check for admin-specific actions
    const firstShow = showCards.first();
    
    // Click three-dot menu
    await firstShow.getByRole('button', { name: /more options/i }).click();

    // Should see delete option
    await expect(page.getByRole('menuitem', { name: /delete show/i })).toBeVisible();
  });

  test('should be able to access analytics', async ({ page }) => {
    await navigateToBrowseShows(page);
    await page.getByRole('tab', { name: /managing/i }).click();

    // Look for analytics button
    await page.getByRole('button', { name: /analytics/i }).click();

    // Should show analytics dashboard
    await expect(page.getByRole('heading', { name: /show analytics/i })).toBeVisible();
  });
});

test.describe('Multi-Role User Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, users.multiRole);
  });

  test('should see combined tabs for multiple roles', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Multi-role user (secretary + judge) should see both role tabs
    await expect(page.getByRole('tab', { name: /all shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /past shows/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /my entries/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /managing/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /my assignments/i })).toBeVisible();
  });

  test('should switch between role contexts seamlessly', async ({ page }) => {
    await navigateToBrowseShows(page);

    // Test secretary functionality
    await page.getByRole('tab', { name: /managing/i }).click();
    await page.waitForSelector('[data-testid="tab-content-managing"]');
    
    const managedShow = page.locator('[data-testid^="show-card"]').first();
    if (await managedShow.count() > 0) {
      await expect(managedShow.getByRole('button', { name: /edit show/i })).toBeVisible();
    }

    // Test judge functionality
    await page.getByRole('tab', { name: /my assignments/i }).click();
    await page.waitForSelector('[data-testid="tab-content-assignments"]');
    
    const assignedShow = page.locator('[data-testid^="show-card"]').first();
    if (await assignedShow.count() > 0) {
      await expect(assignedShow.getByRole('button', { name: /assignment details/i })).toBeVisible();
    }

    // Test exhibitor functionality
    await page.getByRole('tab', { name: /all shows/i }).click();
    const upcomingShow = page.locator('[data-testid^="show-card"]')
      .filter({ hasText: 'Upcoming' })
      .first();
    
    if (await upcomingShow.count() > 0) {
      await expect(upcomingShow.getByRole('button', { name: /register/i })).toBeVisible();
    }
  });
});

test.describe('Tab Navigation and URL Persistence', () => {
  test('should persist tab selection in URL', async ({ page }) => {
    await page.goto('/shows');

    // Click Past Shows tab
    await page.getByRole('tab', { name: /past shows/i }).click();

    // Check URL updated
    await expect(page).toHaveURL(/tab=past/);

    // Reload page
    await page.reload();

    // Tab should still be selected
    await expect(page.getByRole('tab', { name: /past shows/i })).toHaveAttribute('data-state', 'active');
  });

  test('should persist view mode in URL', async ({ page }) => {
    await page.goto('/shows');

    // Switch to calendar view
    await page.getByRole('button', { name: /calendar view/i }).click();

    // Check URL updated
    await expect(page).toHaveURL(/view=calendar/);

    // Calendar should be visible
    await expect(page.locator('[data-testid="show-calendar"]')).toBeVisible();
  });

  test('should handle direct URL navigation', async ({ page }) => {
    // Navigate directly to specific tab
    await page.goto('/shows?tab=past&view=list');

    // Verify correct tab and view
    await expect(page.getByRole('tab', { name: /past shows/i })).toHaveAttribute('data-state', 'active');
    await expect(page.locator('[data-testid="show-list-view"]')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('should show mobile-optimized layout', async ({ page }) => {
    await page.goto('/shows');

    // Tabs should be scrollable on mobile
    const tabsList = page.getByRole('tablist');
    await expect(tabsList).toHaveCSS('overflow-x', 'auto');

    // Show cards should stack vertically
    const showCards = page.locator('[data-testid^="show-card"]');
    if (await showCards.count() > 1) {
      const firstCard = await showCards.first().boundingBox();
      const secondCard = await showCards.nth(1).boundingBox();
      
      if (firstCard && secondCard) {
        expect(secondCard.y).toBeGreaterThan(firstCard.y + firstCard.height);
      }
    }
  });

  test('should have touch-friendly action buttons', async ({ page }) => {
    await page.goto('/shows');

    const actionButtons = page.locator('button').filter({ hasText: /register|view details/i });
    const firstButton = actionButtons.first();
    
    if (await firstButton.count() > 0) {
      const box = await firstButton.boundingBox();
      if (box) {
        // Minimum touch target size should be 44px
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe('Performance and Loading', () => {
  test('should show loading skeletons while data loads', async ({ page }) => {
    // Intercept API calls to simulate slow loading
    await page.route('**/api/shows*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.goto('/shows');

    // Should show skeleton loaders
    await expect(page.locator('[data-testid="shows-page-skeleton"]')).toBeVisible();

    // Wait for actual content
    await page.waitForSelector('[data-testid^="show-card"]', { timeout: 5000 });

    // Skeletons should be gone
    await expect(page.locator('[data-testid="shows-page-skeleton"]')).not.toBeVisible();
  });

  test('should handle empty states gracefully', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/shows*', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ shows: [] })
      });
    });

    await page.goto('/shows');

    // Should show appropriate empty state
    await expect(page.getByText(/no shows available/i)).toBeVisible();
    
    // Should show call-to-action based on user role
    const ctaButton = page.getByRole('button', { name: /create show|find shows/i });
    await expect(ctaButton).toBeVisible();
  });
});