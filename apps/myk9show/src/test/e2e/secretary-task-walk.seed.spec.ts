import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { signInAsSecretary } from './helpers/testUsers';

/**
 * Step-driven explorer for the secretary task walk.
 * Audit instrument, not a CI spec — see docs/audits/2026-08-28-secretary-task-walk.md.
 *
 * WALK_STEPS  path to a JSON file: { start, steps: [...] }
 * WALK_OUT    directory to write snapshots into
 */
type Step =
  | { action: 'goto'; url: string; label?: string }
  | { action: 'click'; role?: string; name?: string; testid?: string; text?: string; nth?: number; label?: string }
  | { action: 'fill'; label_for?: string; testid?: string; placeholder?: string; value: string; nth?: number; label?: string }
  | { action: 'select'; label_for?: string; testid?: string; value: string; nth?: number; label?: string }
  | { action: 'press'; key: string; label?: string }
  | { action: 'wait'; ms: number; label?: string }
  | { action: 'snapshot'; label?: string }
  | { action: 'eval'; expr: string; label?: string }
  | { action: 'jsclick'; contains: string; label?: string };

const STEPS_FILE = process.env.WALK_STEPS ?? '';
const OUT_DIR = process.env.WALK_OUT ?? '';

function locate(page: Page, s: Step & { role?: string; name?: string; testid?: string; text?: string; label_for?: string; placeholder?: string; nth?: number }) {
  let loc;
  if (s.testid) loc = page.getByTestId(s.testid);
  else if (s.label_for) loc = page.getByLabel(new RegExp(s.label_for, 'i'));
  else if (s.placeholder) loc = page.getByPlaceholder(new RegExp(s.placeholder, 'i'));
  else if (s.role) loc = page.getByRole(s.role as 'button', s.name ? { name: new RegExp(s.name, 'i') } : undefined);
  else if (s.text) loc = page.getByText(new RegExp(s.text, 'i'));
  else throw new Error('step has no locator: ' + JSON.stringify(s));
  return loc.nth(s.nth ?? 0);
}

test('secretary walk', async ({ page }) => {
  // Audit instrument, not a CI spec. It lives in the Playwright testDir so it can
  // reuse the project's sign-in helper, so it must be INERT unless explicitly
  // driven -- otherwise a full e2e run fails on a tool that has nothing to do.
  test.skip(
    !STEPS_FILE || !OUT_DIR,
    'Set WALK_STEPS (step plan JSON) and WALK_OUT (snapshot dir) to drive the walk.'
  );
  test.setTimeout(15 * 60 * 1000);
  const plan = JSON.parse(fs.readFileSync(STEPS_FILE, 'utf8')) as { start?: string; steps: Step[] };
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const consoleErrors: string[] = [];
  const requests: string[] = [];
  page.on('request', r => {
    const u = r.url();
    if (/supabase|rest\/v1|auth\/v1|functions\/v1/.test(u)) requests.push(`${r.method()} ${u.slice(0, 160)}`);
    // Audit aid: capture the body of show writes so a dropped field is visible.
    if (/rpc\/create_show_with_children/.test(u) || (/rest\/v1\/shows/.test(u) && r.method() !== 'GET')) {
      const body = r.postData() ?? '';
      requests.push(`  BODY ${r.method()} ${u.replace(/^.*rest\/v1\//, '')} :: ${body.slice(0, 700)}`);
    }
  });
  page.on('response', r => {
    const u = r.url();
    if (/rest\/v1|functions\/v1/.test(u) && r.status() >= 400) {
      consoleErrors.push(`HTTP ${r.status()} ${decodeURIComponent(u).slice(0, 900)}`);
      void r.text().then(b => { consoleErrors.push(`  BODY(${r.status()}): ${b.slice(0, 400)}`); }).catch(() => undefined);
    }
    // Audit aid: a PATCH that returns 200 with an EMPTY array is an RLS denial or a
    // filter miss, not a success -- capture it even though it is not a 4xx.
    if (/rest\/v1\/entries/.test(u) && r.request().method() === 'PATCH') {
      void r.text().then(b => {
        consoleErrors.push(`  PATCH ${r.status()} rows=${b.trim()===''?'(empty body)':b.slice(0,200)}`);
      }).catch(() => undefined);
    }
  });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 300)));

  // Cold vite compile can blow the app's own 15s sign-in budget; one retry.
  try {
    await signInAsSecretary(page, plan.start ?? '/secretary/dashboard');
  } catch {
    await signInAsSecretary(page, plan.start ?? '/secretary/dashboard');
  }

  const dump = async (i: number, label: string) => {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const snap = await page.locator('body').ariaSnapshot().catch(e => 'SNAPSHOT FAILED: ' + String(e));
    const errs = consoleErrors.splice(0);
    const reqs = requests.splice(0);
    fs.writeFileSync(
      path.join(OUT_DIR, `${String(i).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.yaml`),
      `# url: ${page.url()}\n# console errors: ${errs.length ? '\n#   ' + errs.join('\n#   ') : 'none'}\n# requests: ${reqs.length ? '\n#   ' + reqs.join('\n#   ') : 'none'}\n\n${snap}\n`
    );
  };

  await dump(0, 'start');
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const label = s.label ?? s.action;
    try {
      if (s.action === 'goto') await page.goto(s.url);
      else if (s.action === 'wait') await page.waitForTimeout(s.ms);
      else if (s.action === 'press') await page.keyboard.press(s.key);
      else if (s.action === 'click') await locate(page, s).click({ timeout: 15000 });
      else if (s.action === 'fill') await locate(page, s).fill(s.value, { timeout: 15000 });
      else if (s.action === 'jsclick') {
        const ok = await page.evaluate((needle: string) => {
          const leaves = Array.from(document.querySelectorAll('*')).filter(
            e => e.children.length === 0 && (e.textContent || '').trim() === needle
          );
          const el = leaves[0];
          if (!el) return false;
          const target = (el.closest('[role="option"],button,li,[data-value],div[class*="cursor"]') ?? el.parentElement ?? el) as HTMLElement;
          target.click();
          return true;
        }, s.contains);
        if (!ok) throw new Error('jsclick found no leaf matching: ' + s.contains);
      }
      else if (s.action === 'eval') {
        const v = await page.evaluate(s.expr);
        fs.appendFileSync(path.join(OUT_DIR, 'eval.txt'), `${label}: ${JSON.stringify(v, null, 2)}\n`);
      }
      else if (s.action === 'select') await locate(page, s).selectOption(s.value, { timeout: 15000 });
      await page.waitForTimeout(600);
      await dump(i + 1, label);
    } catch (e) {
      await dump(i + 1, `FAILED-${label}`);
      fs.appendFileSync(path.join(OUT_DIR, 'errors.txt'), `step ${i + 1} (${label}): ${String(e).slice(0, 400)}\n`);
      break;
    }
  }
  expect(true).toBe(true);
});
