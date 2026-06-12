import { describe, expect, expectTypeOf, it } from 'vitest';

import { Constants } from '../index';
import type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../index';

describe('canonical database type exports', () => {
  it('exports runtime constants for the public schema', () => {
    expect(Constants.public.Enums).toBeDefined();
  });

  it('exposes generated helper aliases used by app consumers', () => {
    const showRow: Pick<Tables<'shows'>, 'id' | 'name'> = {
      id: 'show-id',
      name: 'Test Show',
    };
    const showInsert: Pick<TablesInsert<'shows'>, 'name'> = { name: 'Test Show' };
    const showUpdate: TablesUpdate<'shows'> = { name: 'Updated Show' };
    const secretaryTask: Partial<Tables<'secretary_tasks'>> = { id: 'task-id' };
    const jsonValue: Json = { ok: true };

    expectTypeOf<Database['public']['Tables']>().toHaveProperty('shows');
    expectTypeOf<Database['public']['Tables']>().toHaveProperty('secretary_tasks');
    expectTypeOf<Enums<never>>().toEqualTypeOf<never>();
    expectTypeOf<CompositeTypes<never>>().toEqualTypeOf<never>();

    expect(showRow).toEqual({ id: 'show-id', name: 'Test Show' });
    expect(showInsert.name).toBe('Test Show');
    expect(showUpdate.name).toBe('Updated Show');
    expect(secretaryTask.id).toBe('task-id');
    expect(jsonValue).toEqual({ ok: true });
  });
});
