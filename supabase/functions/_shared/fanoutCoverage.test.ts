import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('fanout fail-closed wiring', () => {
  it('routes show, role, and subscription query errors through the shared seam', () => {
    const chatSource = readFileSync(
      join(__dirname, '../push-trigger-chat-message/index.ts'),
      'utf8'
    );
    // Staff recipient queries moved to recipients.ts (MYK9-726); their
    // fail-closed behavior is also exercised in userRolePerson.test.ts.
    const chatRecipientsSource = readFileSync(
      join(__dirname, '../push-trigger-chat-message/recipients.ts'),
      'utf8'
    );
    const announcementSource = readFileSync(
      join(__dirname, '../push-trigger-announcement/index.ts'),
      'utf8'
    );

    expect(chatSource).toContain('assertAudienceQuerySucceeded(showError)');
    expect(chatRecipientsSource).toContain('assertAudienceQuerySucceeded(secretariesError)');
    expect(chatSource).toContain('assertAudienceQuerySucceeded(subscriptionsError)');
    expect(announcementSource).toContain('assertAudienceQuerySucceeded(exhibitorError)');
    expect(announcementSource).toContain('assertAudienceQuerySucceeded(officialError)');
    expect(announcementSource).toContain('assertAudienceQuerySucceeded(subError)');
  });
});
