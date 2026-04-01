import { parseSSEStream } from '@/services/askqService';

describe('askqService', () => {
  describe('parseSSEStream', () => {
    it('parses tools_used event', async () => {
      const events: Array<{ event: string; data: unknown }> = [];
      const stream = createMockSSEStream([
        'event: tools_used\ndata: ["search_rules"]\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        events.push({ event, data });
      });

      expect(events[0]).toEqual({ event: 'tools_used', data: ['search_rules'] });
    });

    it('accumulates token events', async () => {
      const tokens: string[] = [];
      const stream = createMockSSEStream([
        'event: token\ndata: "Hello"\n\n',
        'event: token\ndata: " world"\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'token') tokens.push(data as string);
      });

      expect(tokens).toEqual(['Hello', ' world']);
    });

    it('parses meta event with rate limit info', async () => {
      let meta: unknown;
      const stream = createMockSSEStream([
        'event: meta\ndata: {"remaining":7,"limit":10,"responseTimeMs":1200}\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'meta') meta = data;
      });

      expect(meta).toEqual({ remaining: 7, limit: 10, responseTimeMs: 1200 });
    });

    it('parses sources event', async () => {
      let sources: unknown;
      const stream = createMockSSEStream([
        'event: sources\ndata: {"rules":[{"title":"Time limits"}]}\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'sources') sources = data;
      });

      expect(sources).toEqual({ rules: [{ title: 'Time limits' }] });
    });
  });
});

function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}
