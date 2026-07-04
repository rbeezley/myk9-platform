import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Structural tests verifying the HandlerSelectionDialog has been upgraded
 * from a plain text input to a combobox with people search.
 */

describe('HandlerSelectionDialog — Combobox Upgrade', () => {
  const filePath = path.join(
    __dirname,
    '../../components/shows/RegistrationWorkflow/HandlerSelectionDialog.tsx'
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(filePath, 'utf8');
  });

  it('should import useUserStore for people data', () => {
    expect(content).toContain('useUserStore');
  });

  it('should import filterPeopleByName for search', () => {
    expect(content).toContain('filterPeopleByName');
  });

  it('should track selectedPersonIds state', () => {
    expect(content).toContain('selectedPersonIds');
  });

  it('should use selectedPersonIds for handlerId in handleSubmit', () => {
    const submitStart = content.indexOf('const handleSubmit');
    // Use the next top-level function as the boundary (avoids matching inner '};')
    const submitEnd = content.indexOf('const resetToOwner', submitStart);
    const submitBody = content.substring(submitStart, submitEnd);
    expect(submitBody).toContain('selectedPersonIds');
    expect(submitBody).not.toMatch(/handlerId:\s*dog\?\.ownerId/);
  });

  it('should determine isOwner by person ID or name match', () => {
    expect(content).toContain('selectedPersonIds[dogId]');
  });

  it('should cap filtered results at 10', () => {
    expect(content).toMatch(/\.slice\(0,\s*10\)/);
  });

  // SA-008: the directory must be gated for exhibitors — both the fetch and the
  // rendered list. Behavioral gate coverage lives in HandlerSelectionDialog.gate.test.tsx.
  it('gates the directory load on the shared people-directory predicate', () => {
    expect(content).toContain('shouldLoadPeopleDirectory');
    expect(content).toContain('canLoadDirectory');
  });

  it('masks the persisted people list to [] when the role gate is closed', () => {
    expect(content).toMatch(/people=\{canLoadDirectory \? people : \[\]\}/);
  });
});
