import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export type BrowserHealth = {
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
};

const DEFAULT_RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

export function createBrowserHealth(): BrowserHealth {
  return {
    consoleErrors: [],
    pageErrors: [],
    failedResponses: [],
  };
}

export function watchBrowserHealth(page: Page, health: BrowserHealth) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const location = msg.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber})` : '';
      health.consoleErrors.push(`${msg.text()}${source}`);
    }
  });

  page.on('pageerror', error => {
    health.pageErrors.push(error.message);
  });

  page.on('response', response => {
    const status = response.status();
    if (status >= 400 && isAppOwnedUrl(response.url())) {
      health.failedResponses.push(`${status} ${response.request().method()} ${response.url()}`);
    }
  });
}

export async function writeUatFinding(
  testInfo: TestInfo,
  role: string,
  journey: string,
  status: 'passed' | 'failed' | 'blocked',
  details: string[]
) {
  const runId = process.env.UAT_RUN_ID || DEFAULT_RUN_ID;
  const outputDir = path.resolve(process.cwd(), 'test-results', 'uat');
  await mkdir(outputDir, { recursive: true });

  const filePath = path.join(outputDir, `findings-${runId}.md`);
  const body = [
    `# UAT Findings ${runId}`,
    '',
    `| Role | Journey | Status | Test | Details |`,
    `| --- | --- | --- | --- | --- |`,
    `| ${role} | ${journey} | ${status} | ${escapeCell(testInfo.title)} | ${escapeCell(details.join(' / ') || 'No issues recorded.')} |`,
    '',
  ].join('\n');

  await appendFile(filePath, body, 'utf8');
  await testInfo.attach('uat-finding', { path: filePath, contentType: 'text/markdown' });
}

export function summarizeHealth(health: BrowserHealth): string[] {
  return [
    ...health.pageErrors.map(error => `pageerror: ${error}`),
    ...health.consoleErrors.map(error => `console error: ${error}`),
    ...health.failedResponses.map(response => `failed response: ${response}`),
  ];
}

function isAppOwnedUrl(url: string): boolean {
  return (
    url.includes('/rest/v1/') ||
    url.includes('/functions/v1/') ||
    url.includes('/auth/v1/') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://localhost')
  );
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}
