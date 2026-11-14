import { configure } from '@testing-library/react';

/**
 * How long a page-level test waits for a full page render (hydrate, sync
 * settle, cards drawn) before `findBy*` / `waitFor` give up. Testing-library's
 * 1 s default is enough alone but fails on a loaded CI shard (MYK9-1962).
 * Importing this module raises it for that test file only (vitest isolates
 * modules per file); assertions are untouched.
 */
export const PAGE_RENDER_WAIT_MS = 5000;

configure({ asyncUtilTimeout: PAGE_RENDER_WAIT_MS });
