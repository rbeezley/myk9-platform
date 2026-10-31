import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: log.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createAppQueryClient } from './queryClient';

async function failMutation(meta?: Record<string, unknown>) {
  const client = createAppQueryClient();
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async (_variables: { body: string }) => {
      throw new Error('boom');
    },
    ...(meta && { meta }),
  });
  await mutation.execute({ body: 'private words' }).catch(() => undefined);
}

describe('global mutation error logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the variables of an ordinary failed mutation', async () => {
    await failMutation();
    expect(log.error).toHaveBeenCalledWith(
      'Mutation error',
      'query',
      { variables: { body: 'private words' } },
      expect.any(Error)
    );
  });

  it('never passes the variables of a sensitive mutation to the logger', async () => {
    await failMutation({ sensitiveVariables: true });
    expect(log.error).toHaveBeenCalledWith(
      'Mutation error',
      'query',
      { variables: '[redacted]' },
      expect.any(Error)
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('private words');
  });
});
