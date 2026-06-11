import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * These tests verify that handler assignment checks use handlerName (not handlerId)
 * so that free-text handlers (no person record) display correctly.
 *
 * Bug: when a dog has no owner, handlerId is '' and !!'' === false,
 * causing "Not assigned" to display even after a handler name was entered.
 */

describe('Handler Assignment Bug Fixes', () => {
  describe('HandlerAssignmentStep', () => {
    it('should check handlerName not handlerId for hasHandler', () => {
      const filePath = path.join(
        __dirname,
        '../../components/shows/RegistrationWorkflow/HandlerAssignmentStep.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('hasHandler: !!handler?.handlerName');
      expect(content).not.toContain('hasHandler: !!handler?.handlerId');
    });
  });

  describe('InlineHandlerSection', () => {
    it('should check handlerName not handlerId for hasHandler', () => {
      const filePath = path.join(
        __dirname,
        '../../components/shows/RegistrationWorkflow/InlineHandlerSection.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('hasHandler: !!handler?.handlerName');
      expect(content).not.toContain('hasHandler: !!handler?.handlerId');
    });
  });

  describe('RegistrationWizardPage proceed gating', () => {
    // Next-button gating moved from an inline canProceed() switch into
    // proceedBlockedReason (proceedGating.ts); the handlerName-vs-handlerId
    // guard now lives in the gating-context construction in the page.
    it('should derive unassigned handlers from handlerName not handlerId', () => {
      const filePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const content = fs.readFileSync(filePath, 'utf8');
      const gatingStart = content.indexOf('proceedBlockedReason({');
      expect(gatingStart).toBeGreaterThan(-1);
      const gatingEnd = content.indexOf('});', gatingStart);
      const gatingBody = content.substring(gatingStart, gatingEnd);
      expect(gatingBody).toContain('handlerName');
      expect(gatingBody).not.toContain('handlerId');
    });
  });
});
