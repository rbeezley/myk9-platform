import { describe, expect, it, vi } from 'vitest';
import { deliverEmergencyTrialPacket } from './deliverEmergencyTrialPacket';

function client(options?: { uploadError?: Error; invokeError?: Error }) {
  const upload = vi.fn().mockResolvedValue({ error: options?.uploadError ?? null });
  const invoke = vi.fn().mockResolvedValue({
    data: options?.invokeError
      ? null
      : {
          snapshotId: 'snapshot-1',
          generatedAt: '2026-08-20T22:00:00.000Z',
          recipientCount: 2,
          linkExpiresAt: '2026-11-03T00:00:00.000Z',
          pageCount: 12,
        },
    error: options?.invokeError ?? null,
  });
  const from = vi.fn().mockReturnValue({ upload });
  return { supabase: { storage: { from }, functions: { invoke } }, from, upload, invoke };
}

describe('deliverEmergencyTrialPacket', () => {
  it('uploads an immutable private PDF and invokes delivery without caller-supplied recipients', async () => {
    const { supabase, from, upload, invoke } = client();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await deliverEmergencyTrialPacket(
      {
        showId: 'show-1',
        snapshotId: 'snapshot-1',
        generatedAt: '2026-08-20T22:00:00.000Z',
        bytes,
        pageCount: 12,
      },
      supabase
    );

    expect(from).toHaveBeenCalledWith('trial-packets');
    expect(upload).toHaveBeenCalledWith('show-1/snapshot-1.pdf', expect.any(Blob), {
      cacheControl: '0',
      contentType: 'application/pdf',
      upsert: false,
    });
    const blob = upload.mock.calls[0][1] as Blob;
    expect({ size: blob.size, type: blob.type }).toEqual({ size: 3, type: 'application/pdf' });
    expect(invoke).toHaveBeenCalledWith('deliver-trial-packet', {
      body: {
        byteSize: 3,
        generatedAt: '2026-08-20T22:00:00.000Z',
        pageCount: 12,
        sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
        showId: 'show-1',
        snapshotId: 'snapshot-1',
        storagePath: 'show-1/snapshot-1.pdf',
      },
    });
    expect(result).toMatchObject({ recipientCount: 2, snapshotId: 'snapshot-1' });
  });

  it('does not invoke email delivery after an upload failure', async () => {
    const { supabase, invoke } = client({ uploadError: new Error('storage unavailable') });

    await expect(
      deliverEmergencyTrialPacket(
        {
          showId: 'show-1',
          snapshotId: 'snapshot-1',
          generatedAt: '2026-08-20T22:00:00.000Z',
          bytes: new Uint8Array([1]),
          pageCount: 1,
        },
        supabase
      )
    ).rejects.toThrow('Could not store the emergency packet');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports email failure without deleting or claiming delivery of the uploaded snapshot', async () => {
    const { supabase, upload } = client({ invokeError: new Error('email unavailable') });

    await expect(
      deliverEmergencyTrialPacket(
        {
          showId: 'show-1',
          snapshotId: 'snapshot-1',
          generatedAt: '2026-08-20T22:00:00.000Z',
          bytes: new Uint8Array([1]),
          pageCount: 1,
        },
        supabase
      )
    ).rejects.toMatchObject({ name: 'EmergencyPacketDeliveryError', storagePath: 'show-1/snapshot-1.pdf' });
    expect(upload).toHaveBeenCalledOnce();
  });
});
