import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('privileged Edge fanout failure coverage', () => {
  it('fails closed when push-subscription audience resolution errors', () => {
    const chatSource = readFileSync(
      join(__dirname, '../push-trigger-chat-message/index.ts'),
      'utf8'
    );
    const announcementSource = readFileSync(
      join(__dirname, '../push-trigger-announcement/index.ts'),
      'utf8'
    );

    expect(chatSource).toContain('if (subscriptionsError)');
    expect(announcementSource).toContain('if (subError)');
    expect(chatSource).toContain("throw new HttpError(500, 'Audience resolution failed')");
    expect(announcementSource).toContain("throw new HttpError(500, 'Audience resolution failed')");
  });
});
