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
    expect(Constants.public.Enums).toEqual({});
  });

  it('exposes generated helper aliases used by app consumers', () => {
    type PublicCompositeTypeName = keyof Database['public']['CompositeTypes'];
    type PublicEnumName = keyof Database['public']['Enums'];

    expectTypeOf<Database['public']['Tables']>().toHaveProperty('shows');
    expectTypeOf<Database['public']['Tables']>().toHaveProperty('secretary_tasks');
    expectTypeOf<Tables<'shows'>>().toMatchTypeOf<{
      id: string;
      name: string;
    }>();
    expectTypeOf<TablesInsert<'shows'>>().toMatchTypeOf<{
      end_date: string;
      name: string;
      organization: string;
      start_date: string;
    }>();
    expectTypeOf<TablesUpdate<'shows'>>().toMatchTypeOf<{ name?: string }>();
    expectTypeOf<Tables<'secretary_tasks'>>().toMatchTypeOf<{
      id: string;
      status: string;
      title: string;
    }>();
    expectTypeOf<{ ok: true }>().toMatchTypeOf<Json>();
    expectTypeOf<PublicEnumName>().toEqualTypeOf<never>();
    expectTypeOf<Enums<PublicEnumName>>().toEqualTypeOf<never>();
    expectTypeOf<PublicCompositeTypeName>().toEqualTypeOf<never>();
    expectTypeOf<CompositeTypes<PublicCompositeTypeName>>().toEqualTypeOf<never>();
  });
});
