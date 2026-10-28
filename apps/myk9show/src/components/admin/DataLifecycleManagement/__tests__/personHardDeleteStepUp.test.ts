import { describe, it, expect, vi, beforeEach } from 'vitest';

// MYK9-1443: the Data Lifecycle People section must permanently delete through
// admin-delete-user (which enforces step-up re-auth), never a direct people DELETE.
const { invoke, from } = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  return { ...actual, supabase: { functions: { invoke }, from, rpc: vi.fn() } };
});

import { ENTITY_SECTIONS } from '../deletedEntityConfig';
import { permanentDeleteRefusalMessage } from '@/services/database/permanentDeleteRefusal';

const personSection = () => {
  const section = ENTITY_SECTIONS.find(s => s.type === 'person');
  if (!section) throw new Error('person section missing');
  return section;
};

describe('Data Lifecycle person hard delete', () => {
  beforeEach(() => {
    invoke.mockReset();
    from.mockReset();
  });

  it('invokes admin-delete-user and never deletes from people directly', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    await personSection().hardDelete('person-1');

    expect(invoke).toHaveBeenCalledWith('admin-delete-user', { body: { personId: 'person-1' } });
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces a 403 step_up_required as a failure, not a success', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        // The literal body _shared/http/handler.ts emits for HttpError(403, 'step_up_required').
        context: new Response(JSON.stringify({ error: 'step_up_required' }), { status: 403 }),
      }),
    });

    const result = (await personSection().hardDelete('person-1')) as {
      data: unknown;
      error: { code?: string; message?: string } | null;
    };

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('step_up_required');
    expect(from).not.toHaveBeenCalled();
    // What DeletedEntitiesTab toasts: names the password confirmation, not "try again".
    expect(permanentDeleteRefusalMessage(result.error)).toBe(
      'Nothing was deleted. Confirm your password to continue.'
    );
  });
});
