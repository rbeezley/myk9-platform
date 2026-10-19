import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { disposableClass, registerDisposableProofHooks } from './disposableClass';
import {
  evidence,
  isolatedClient,
  judgeRow,
  rolePage,
  row,
  screenshot,
  secretaryRow,
  setState,
} from './showDayProof.helpers';

registerDisposableProofHooks();

test('secretary and judge preserve stored 61.23 seconds (MYK9-1225)', async ({ browser }, info) => {
  const client = isolatedClient();
  const f = await disposableClass(client, 1);
  await setState(client, f.willowId, {
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 61.23,
    check_in_status: 'completed',
  });
  const secretary = await rolePage(
    browser,
    'SECRETARY',
    `/shows/${f.showId}/trials/${f.trialId}/classes/${f.classId}`
  );
  const judge = await rolePage(browser, 'JUDGE', `/at-show/${f.showId}/class/${f.classId}`);
  await secretary.page.reload();
  const secretaryDog = secretaryRow(secretary.page, 'Willow');
  await expect(secretaryDog).toContainText('1:01.23');
  await expect(secretaryDog).not.toContainText('1:01.22');
  await judge.page.reload();
  await judge.page.getByRole('button', { name: /^Completed/ }).click();
  const judgeDog = judgeRow(judge.page, 'Willow');
  await expect(judgeDog).toContainText('01:01.23');
  expect((await row(client, f.willowId)).search_time_seconds).toBe(61.23);
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  expect(judge.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'centisecond-parity', {
    ...f,
    sql: await row(client, f.willowId),
    secretary: await secretaryDog.innerText(),
    judge: await judgeDog.innerText(),
  });
  await screenshot(secretary.page, info, 'secretary-61.23');
  await screenshot(judge.page, info, 'judge-61.23');
});

for (const width of [375, 1280]) {
  test(`Overview batch preview at ${width}px (MYK9-1244)`, async ({ browser }, info) => {
    const client = isolatedClient();
    const f = await disposableClass(client, 2);
    const secretary = await rolePage(browser, 'SECRETARY', `/shows/${f.showId}?focus=${f.classId}`);
    const page = secretary.page;
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(
      page.getByRole('checkbox', { name: 'Select Check-in sheet to print', exact: true })
    ).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'Select Check-in sheet to print', exact: true })
      .check();
    await page.getByRole('checkbox', { name: 'Select Score sheets to print', exact: true }).check();
    await page.getByRole('button', { name: 'Print selected (2)', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Print selected sheets', exact: true })
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/shows/${f.showId}`);
    const preview = page.locator('iframe[title="Selected sheets preview"]');
    await expect(preview).toHaveAttribute('src', /^blob:/);
    const pdf = await preview.evaluate(async frame =>
      Array.from(
        new Uint8Array(await (await fetch((frame as HTMLIFrameElement).src)).arrayBuffer())
      )
    );
    const document = await PDFDocument.load(new Uint8Array(pdf));
    expect(document.getPageCount()).toBe(2);
    await evidence(info, `batch-preview-${width}`, {
      ...f,
      width,
      pages: document.getPageCount(),
      url: page.url(),
    });
    await info.attach(`merged-${width}.pdf`, {
      body: Buffer.from(pdf),
      contentType: 'application/pdf',
    });
    const printButton = page.getByRole('button', { name: 'Print 2 sheets', exact: true });
    await expect(printButton).toBeEnabled();
    // Capture this fixed viewport: full-page capture can resize the measured
    // cockpit and remount its focused panel while a preview is open.
    await info.attach(`overview-preview-${width}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
    // Exercise the actual browser print implementation; no synthetic afterprint/focus.
    await printButton.click();
    await expect(
      page.getByRole('heading', { name: 'Print selected sheets', exact: true })
    ).toHaveCount(0);
    const readPrints = async () => {
      const { data, error } = await client
        .from('paperwork_prints')
        .select('id,report_id,class_id,scope_kind,printed_at,voided_at,fingerprint')
        .eq('class_id', f.classId)
        .order('report_id');
      if (error) throw error;
      return data;
    };
    await expect
      .poll(async () => (await readPrints()).filter(r => !r.voided_at).map(r => r.report_id))
      .toEqual(['check-in-sheet', 'scoresheet']);
    for (const label of ['Check-in sheet', 'Score sheets']) {
      const undo = page.getByRole('button', { name: `Mark ${label} not printed`, exact: true });
      await expect(undo).toBeVisible();
      await expect(undo.locator('..')).toContainText(/Printed \d/);
    }
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await screenshot(page, info, `overview-printed-${width}`);
    await page.reload();
    for (const label of ['Check-in sheet', 'Score sheets'])
      await expect(
        page.getByRole('button', { name: `Mark ${label} not printed`, exact: true })
      ).toBeVisible();
    const printed = await readPrints();
    for (const report of ['check-in-sheet', 'scoresheet']) {
      await page.goto(
        `/shows/${f.showId}/reports?report=${report}&trialId=${f.trialId}&classId=${f.classId}`
      );
      await expect(page.getByTestId('report-print-status')).toContainText('Printed');
      await expect(page.getByTestId('report-print-status')).not.toContainText('Stale');
      await screenshot(page, info, `reports-${report}-printed-${width}`);
    }
    await page.goto(`/shows/${f.showId}?focus=${f.classId}`);
    for (const label of ['Check-in sheet', 'Score sheets'])
      await page.getByRole('button', { name: `Mark ${label} not printed`, exact: true }).click();
    await expect.poll(async () => (await readPrints()).filter(r => !r.voided_at).length).toBe(0);
    await page.reload();
    for (const label of ['Check-in sheet', 'Score sheets'])
      await expect(
        page.getByRole('button', { name: `Mark ${label} not printed`, exact: true })
      ).toHaveCount(0);
    await evidence(info, `print-and-undo-${width}`, { printed, voided: await readPrints() });
    for (const report of ['check-in-sheet', 'scoresheet']) {
      await page.goto(
        `/shows/${f.showId}/reports?report=${report}&trialId=${f.trialId}&classId=${f.classId}`
      );
      await expect(page.getByTestId('report-print-status')).toContainText('Not confirmed printed');
    }
    expect(secretary.nonLocalSocketUrls).toEqual([]);
  });
}
