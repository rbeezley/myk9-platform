import { describe, expect, it } from 'vitest';
import { GH_MAX_PAGES, ghPages } from './gh-pages.ts';

/**
 * A fake `gh api` reader over `total` rows that serves `&per_page=N&page=M`
 * the way GitHub does, and fails `--paginate` the way the cloud proxy does:
 * its next links use `repositories/{id}/…` paths (MYK9-1425).
 */
function reader(total: number) {
  const calls: string[][] = [];
  const read = (args: string[]) => {
    calls.push(args);
    if (args.includes('--paginate')) throw new Error('Numeric-ID repository paths (HTTP 403)');
    const url = args.find(arg => arg.startsWith('repos/')) ?? '';
    const size = Number(/[?&]per_page=(\d+)/.exec(url)?.[1] ?? 30);
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    const start = (page - 1) * size;
    const rows = Array.from(
      { length: Math.max(0, Math.min(total, start + size) - start) },
      (_, i) => start + i
    );
    return rows;
  };
  return { read, calls };
}

describe('ghPages', () => {
  it('reads every row of a list longer than one page, one request per page', () => {
    const { read, calls } = reader(250);

    expect(ghPages<number>(read, 'repos/o/r/pulls?state=closed')).toEqual(
      Array.from({ length: 250 }, (_, i) => i)
    );
    expect(calls.map(args => args.at(-1))).toEqual([
      'repos/o/r/pulls?state=closed&per_page=100&page=1',
      'repos/o/r/pulls?state=closed&per_page=100&page=2',
      'repos/o/r/pulls?state=closed&per_page=100&page=3',
    ]);
  });

  it('starts the query string when the path has none', () => {
    const { read, calls } = reader(3);

    ghPages<number>(read, 'repos/o/r/issues/1/comments');
    expect(calls[0]).toEqual(['api', 'repos/o/r/issues/1/comments?per_page=100&page=1']);
  });

  it('reads one more, empty page when the list is an exact multiple of a page', () => {
    const { read, calls } = reader(200);

    expect(ghPages<number>(read, 'repos/o/r/pulls')).toHaveLength(200);
    expect(calls).toHaveLength(3);
  });

  it('throws rather than returning a truncated list when every page is full', () => {
    const { read, calls } = reader(Number.MAX_SAFE_INTEGER);

    expect(() => ghPages<number>(read, 'repos/o/r/pulls')).toThrow(
      `more than ${GH_MAX_PAGES} pages`
    );
    expect(calls).toHaveLength(GH_MAX_PAGES);
  });

  it('passes a reader failure through unchanged', () => {
    const failure = new Error('HTTP 502');
    const read = () => {
      throw failure;
    };

    expect(() => ghPages(read, 'repos/o/r/pulls')).toThrow(failure);
  });
});
