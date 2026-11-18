import { describe, expect, it, vi } from 'vitest';
import {
  assertLocalBackend,
  hostResolverRules,
  launchArgs,
  typeSecretChecked,
  writeCheckedShot,
} from '../../../scripts/landing-capture/guardRules';
import { PRODUCTION_PROJECT_REF } from '../productionFixtureGuard';

// Known answers for the two steps of a capture that are ordered checks rather than single
// decisions (scripts/landing-capture/guardRules.ts, MYK9-2181): typing a password, and
// writing an image. Each is driven by fakes that record the order things happened in.

const FIXTURES = new Set([100, 101, 102, 103, 104, 105]);
const PRODUCTION = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

describe('launchArgs', () => {
  it('launches every capture browser with the resolver lock and no proxy', () => {
    expect(launchArgs()).toEqual([
      `--host-resolver-rules=${hostResolverRules()}`,
      '--no-proxy-server',
    ]);
  });
});

describe('assertLocalBackend', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321/'])(
    'accepts %s',
    origin => {
      expect(() => assertLocalBackend(origin)).not.toThrow();
    }
  );

  it.each([
    PRODUCTION,
    'https://someotherproject.supabase.co',
    'https://api.example.com',
    'http://127.0.0.1.example.com:54321',
    '%VITE_SUPABASE_URL%',
    'ws://127.0.0.1:54321',
    '',
    null,
    undefined,
  ])('refuses %s', origin => {
    expect(() => assertLocalBackend(origin)).toThrow(/Capture stopped/);
  });
});

describe('typeSecretChecked', () => {
  const deps = (origin: string | null, stopped = false) => {
    const order: string[] = [];
    return {
      order,
      assertIsolated: vi.fn(() => {
        order.push('assertIsolated');
        if (stopped) throw new Error('Capture stopped');
      }),
      backendOrigin: vi.fn(async () => {
        order.push('backendOrigin');
        return origin;
      }),
      type: vi.fn(async () => {
        order.push('type');
      }),
    };
  };

  it('types only after the stop check, the backend check and the stop check again', async () => {
    const d = deps('http://127.0.0.1:54321');
    await typeSecretChecked(d);
    expect(d.order).toEqual(['assertIsolated', 'backendOrigin', 'assertIsolated', 'type']);
  });

  it('types nothing when the page is built against the production project', async () => {
    const d = deps(PRODUCTION);
    await expect(typeSecretChecked(d)).rejects.toThrow(PRODUCTION);
    expect(d.type).not.toHaveBeenCalled();
  });

  it('types nothing when the page does not say what its backend is', async () => {
    const d = deps(null);
    await expect(typeSecretChecked(d)).rejects.toThrow(/not stated by the page/);
    expect(d.type).not.toHaveBeenCalled();
  });

  it('types nothing, and asks nothing, once the run is stopped', async () => {
    const d = deps('http://127.0.0.1:54321', true);
    await expect(typeSecretChecked(d)).rejects.toThrow('Capture stopped');
    expect(d.backendOrigin).not.toHaveBeenCalled();
    expect(d.type).not.toHaveBeenCalled();
  });

  it('types nothing when the run is stopped while the page is being asked', async () => {
    const d = deps('http://127.0.0.1:54321');
    let calls = 0;
    d.assertIsolated.mockImplementation(() => {
      calls += 1;
      if (calls === 2) throw new Error('Capture stopped');
    });
    await expect(typeSecretChecked(d)).rejects.toThrow('Capture stopped');
    expect(d.type).not.toHaveBeenCalled();
  });
});

describe('writeCheckedShot', () => {
  const deps = (screen: { text: string; labels: string[] }, stopAtCheck = 0) => {
    const order: string[] = [];
    let checks = 0;
    return {
      order,
      assertIsolated: vi.fn(() => {
        order.push('assertIsolated');
        checks += 1;
        if (checks === stopAtCheck) throw new Error('Capture stopped');
      }),
      read: vi.fn(async () => {
        order.push('read');
        return screen;
      }),
      take: vi.fn(async () => {
        order.push('take');
        return 'pixels';
      }),
      save: vi.fn((pixels: string) => {
        order.push(`save ${pixels}`);
      }),
    };
  };
  const shot = (name: string, minLabels: number) => ({ name, fixtures: FIXTURES, minLabels });

  it('saves the file last: stop check, armband check, pixels, stop check, file', async () => {
    const d = deps({ text: '#105', labels: ['105'] });
    await writeCheckedShot(shot('sheet', 1), d);
    expect(d.order).toEqual(['assertIsolated', 'read', 'take', 'assertIsolated', 'save pixels']);
  });

  it('takes and saves nothing when a stranger is on screen', async () => {
    const d = deps({ text: '', labels: ['105', '2001'] });
    await expect(writeCheckedShot(shot('offline', 1), d)).rejects.toThrow(
      'offline: armband 2001 on screen is not a seed fixture'
    );
    expect(d.take).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('takes and saves nothing when the screen shows fewer armband elements than it must', async () => {
    const d = deps({ text: 'Juni', labels: [] });
    await expect(writeCheckedShot(shot('sheet', 1), d)).rejects.toThrow(
      'sheet: 0 armband element(s) on screen, at least 1 expected'
    );
    expect(d.take).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('accepts a screen with no armband element only when the shot says it has none', async () => {
    const d = deps({ text: 'Your ring', labels: [] });
    await writeCheckedShot(shot('classes', 0), d);
    expect(d.save).toHaveBeenCalledTimes(1);
  });

  it('reads, takes and saves nothing once the run is stopped', async () => {
    const d = deps({ text: '', labels: [] }, 1);
    await expect(writeCheckedShot(shot('classes', 0), d)).rejects.toThrow('Capture stopped');
    expect(d.read).not.toHaveBeenCalled();
    expect(d.take).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('leaves no file when the run is stopped while the pixels are taken', async () => {
    const d = deps({ text: '', labels: ['105'] }, 2);
    await expect(writeCheckedShot(shot('sheet', 1), d)).rejects.toThrow('Capture stopped');
    expect(d.take).toHaveBeenCalledTimes(1);
    expect(d.save).not.toHaveBeenCalled();
  });
});
