# App-Specific Playwright Patterns

## Sign-in (SmartSignInPage)

The sign-in page uses a two-step flow: email/passcode field first, then password revealed after.
The credential input is `input#credential` (type="text"), **not** `input[type="email"]`.

```javascript
async function signIn(page, email, password) {
  await page.goto(`${BASE}/sign-in`);
  await page.waitForLoadState('networkidle');

  const credInput = page.locator('#credential');
  await credInput.waitFor({ state: 'visible', timeout: 20000 });
  await credInput.fill(email);
  await credInput.press('Enter');

  // Password input appears after Enter on the credential field
  const pwInput = page.locator('input[type="password"]:visible').first();
  await pwInput.waitFor({ state: 'visible', timeout: 15000 });
  await pwInput.fill(password);
  await pwInput.press('Enter');

  await page.waitForURL(u => !u.href.includes('/sign-in'), { timeout: 25000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}
```

## Sidebar overlay workaround

When the sidebar is collapsed, an `aria-hidden="true" fixed inset-0 z-30` div renders over the
page and intercepts pointer events. Playwright `.click()` hits the overlay, not the button.

**Fix:** use `page.evaluate()` to call `.click()` directly on the DOM element.

```javascript
// Find the button first
const btn = await page.$('[data-testid="sidebar-nav-members"]');
// Then bypass the overlay
await page.evaluate(el => el.click(), btn);

// For nav links by text
const link = await page.$('a[href="/club-admin/members"]');
await page.evaluate(el => el.click(), link);
```

## Add Member dialog

The Add Member dialog is **not** a semantic `[role="dialog"]` element. It's a custom
`fixed inset-0 z-50` div. Do not use `page.locator('[role="dialog"]')`.

```javascript
// Open the dialog
await page.locator('button:has-text("Add Member")').click();
await page.waitForTimeout(500);

// The search input has a known id
const searchInput = page.locator('#member-search');
await searchInput.waitFor({ state: 'visible', timeout: 10000 });

// Always filter to "e2e" to avoid real-user PII in the screenshot
await searchInput.fill('e2e');
await page.waitForTimeout(500); // debounce
```

## Action menus (⋮ three-dot menus)

Action menus in tables render `absolute right-0 top-full z-50 w-56` but the table container
may have `overflow: hidden`, which clips the dropdown. Two approaches:

1. **Screenshot before opening** — capture the page state that shows the badge/result of
   a completed action rather than the open dropdown.
2. **Scroll into view** — `await btn.scrollIntoViewIfNeeded()` before clicking, then
   screenshot quickly before the dropdown repositions.

For the Members page **Show Manager badge**, the badge is visible on the row itself without
opening the menu — prefer that state for screenshots.

## Post-navigation settle

After any navigation or interaction, always give the UI time to settle:

```javascript
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000); // for React Query re-renders + Zustand hydration
```

## Screenshot save pattern

```javascript
await page.screenshot({
  path: `/tmp/myk9-shots/${SHOT_ID}.png`,
  fullPage: false, // viewport crop only — avoids showing page below the fold
});
```

Then copy to the repo:
```bash
cp /tmp/myk9-shots/C-07.png docs/screenshots/C-07.png
```

## Playwright require path

Scripts written to `/tmp/` (outside the project) need an explicit path to the installed Playwright:

```javascript
const pw = require('/path/to/project/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.js');
```

Scripts in `.claude/skills/screenshot-docs/scripts/` run from the project root and can use:

```javascript
const pw = require('playwright');
```
