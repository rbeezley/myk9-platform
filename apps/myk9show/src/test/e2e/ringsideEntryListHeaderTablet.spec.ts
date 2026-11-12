import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../tailwind.config.js';
import { EntryListHeader } from '../../../../../packages/ringside/src/pages/EntryList/components/EntryListHeader';
import type { ClassInfo } from '../../../../../packages/ringside/src/pages/EntryList/hooks/useEntryListData';
import {
  FilterTriggerButton,
  OfflineSyncNoteView,
  SyncIndicator,
} from '@/features/at-show/slots/atShowSyncChrome';

/**
 * MYK9-1899: on a portrait tablet the ringside entry-list header put the offline note and the
 * "Waiting to sync N" pill beside the class name, which was left a sliver ("Contain/er/Novice A",
 * then one letter per line, the header ~540px tall). Class names cannot see that; only rendered
 * geometry can. Hermetic (no sign-in, no staging): the REAL EntryListHeader, SyncIndicator,
 * FilterTriggerButton and offline note markup, styled by Tailwind compiled from the app's own
 * config. Fonts are the browser default sans, so widths are indicative, not pixel-exact.
 */

const LONGEST_CLASS = 'Handler Discrimination Advanced';
const SHORT_CLASS = 'Container Novice A';
const SCREENS = [
  { name: '768 portrait', width: 768, height: 1024 },
  { name: '834 portrait', width: 834, height: 1112 },
  { name: '1024 landscape', width: 1024, height: 768 },
] as const;
const MAX_HEADER_HEIGHT = 160;

// Only the files this header is made of, so the stylesheet compiles in seconds, not the app's tens.
const CSS_SOURCES = [
  '../../../../../packages/ringside/src/pages/EntryList/components/EntryListHeader.tsx',
  '../../../../../packages/ringside/src/pages/EntryList/components/entryListHeaderHelpers.tsx',
  '../../../../../packages/scoring-ui/src/components/OfflineScoresIndicator.tsx',
  '../../../../../packages/ui/src/**/*.{ts,tsx}',
  '../../features/at-show/slots/atShowSyncChrome.tsx',
  '../../features/offline-readiness/OfflineStatusLine.tsx',
  '../../components/ui/button.tsx',
].map(source => fileURLToPath(new URL(source, import.meta.url)));

let cssPromise: Promise<string> | undefined;
function appCss(): Promise<string> {
  cssPromise ??= postcss([tailwindcss({ ...tailwindConfig, content: CSS_SOURCES })])
    .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
    .then(result => result.css);
  return cssPromise;
}

function classInfo(className: string): ClassInfo {
  return { className, classStatus: 'in_progress' } as unknown as ClassInfo;
}

function headerHtml(args: { className: string; offline: boolean; pending: number }): string {
  const element = createElement(
    MemoryRouter,
    null,
    createElement(EntryListHeader, {
      classInfo: classInfo(args.className),
      isRefreshing: false,
      isSyncing: false,
      hasError: false,
      pendingCount: args.pending,
      hasActiveFilters: false,
      onFilterClick: () => undefined,
      onRefresh: () => undefined,
      up: { label: 'Classes', to: '/' },
      actionsMenu: {} as never,
      CompactOfflineIndicator: () =>
        args.offline
          ? createElement(OfflineSyncNoteView, {
              label:
                args.pending > 0
                  ? `Offline · ${args.pending} changes saved on this device`
                  : 'Offline · scores saved on this device',
            })
          : null,
      SyncIndicator,
      RefreshIndicator: () => null,
      FilterTriggerButton,
      ClassDetailsPopover: () => null,
    })
  );
  return renderToStaticMarkup(element);
}

async function load(page: Page, html: string): Promise<void> {
  const css = await appCss();
  await page.setContent(
    `<!DOCTYPE html><html><head><style>${css}</style></head><body>${html}</body></html>`
  );
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')!;
    const h1 = header.querySelector('h1')!;
    const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
    // A word split across lines has more than one client rect.
    const text = h1.firstChild as Text;
    const brokenWords: string[] = [];
    let offset = 0;
    for (const word of (text.textContent ?? '').split(' ')) {
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + word.length);
      if (range.getClientRects().length > 1) brokenWords.push(word);
      offset += word.length + 1;
    }
    const note = header.querySelector<HTMLElement>('[role="status"]');
    const noteText = note?.lastElementChild as HTMLElement | undefined;
    return {
      headerHeight: header.getBoundingClientRect().height,
      lines: Math.round(h1.getBoundingClientRect().height / lineHeight),
      brokenWords,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      noteClipped: noteText ? noteText.scrollWidth > noteText.clientWidth : false,
      noteVisible: note ? note.getBoundingClientRect().width > 0 : null,
    };
  });
}

for (const screen of SCREENS) {
  for (const className of [SHORT_CLASS, LONGEST_CLASS]) {
    for (const offline of [false, true]) {
      for (const pending of [0, 3]) {
        test(`${screen.name}: "${className}" ${offline ? 'offline' : 'online'}, ${pending} queued keeps a short header and whole words (MYK9-1899)`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: screen.width, height: screen.height });
          await load(page, headerHtml({ className, offline, pending }));
          const m = await measure(page);

          expect(m.lines, 'class name lines').toBeLessThanOrEqual(2);
          expect(m.brokenWords, 'words split across lines').toEqual([]);
          expect(m.headerHeight, 'header height').toBeLessThan(MAX_HEADER_HEIGHT);
          expect(m.overflowX, 'horizontal overflow').toBeLessThanOrEqual(0);
          expect(m.noteClipped, 'offline note clipped').toBe(false);
          if (offline) expect(m.noteVisible).toBe(true);
        });
      }
    }
  }
}

test('known-answer control: the measurement reports a crushed class name (MYK9-1899)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await load(page, headerHtml({ className: LONGEST_CLASS, offline: true, pending: 3 }));
  // Squeeze the class name the way the old layout did: a 60px column.
  await page.addStyleTag({ content: 'h1 { width: 60px !important; overflow-wrap: anywhere }' });
  const m = await measure(page);
  expect(m.lines).toBeGreaterThan(2);
});
