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

  describe('RegistrationWizardPage canProceed validation', () => {
    it('should validate handlerName not handlerId in canProceed', () => {
      const filePath = path.join(__dirname, '../../pages/RegistrationWizardPage.tsx');
      const content = fs.readFileSync(filePath, 'utf8');
      const canProceedStart = content.indexOf('const canProceed');
      const canProceedEnd = content.indexOf('};', canProceedStart);
      const canProceedBody = content.substring(canProceedStart, canProceedEnd);
      expect(canProceedBody).toContain('handlerName');
      expect(canProceedBody).not.toContain('handlerId');
    });
  });
});
