import { afterAll, describe, expect, it } from 'vitest';
import { router } from './router';

describe('app router', () => {
  afterAll(() => router.dispose());

  it('is backed by a data router with the app shell as its root route', () => {
    expect(router.state.location.pathname).toBe('/');
    expect(router.routes).toHaveLength(1);
    expect(router.routes[0]?.element).toBeTruthy();
    expect(router.routes[0]?.children?.length).toBeGreaterThan(0);
  });
});
