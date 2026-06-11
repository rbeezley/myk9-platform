import { describe, expect, it } from 'vitest';
import {
  currentSurface,
  isWizardSurface,
  isPathInWizardAllowlist,
  isPathAllowedInCurrentSurface,
} from './surface';

describe('surface config', () => {
  // The test runner runs without VITE_PUBLIC_SURFACE set, so we should
  // land on 'full'. If this flips, the gate would be live in dev/CI and
  // silently 404 routes — that's a regression we want to catch.
  it("defaults to 'full' when VITE_PUBLIC_SURFACE is unset", () => {
    expect(currentSurface).toBe('full');
    expect(isWizardSurface).toBe(false);
  });

  it('allows every path under the full surface', () => {
    expect(isPathAllowedInCurrentSurface('/scoring/whatever')).toBe(true);
    expect(isPathAllowedInCurrentSurface('/admin/users')).toBe(true);
  });
});

describe('isPathInWizardAllowlist', () => {
  it('allows the marketing landing, auth, and wizard paths', () => {
    expect(isPathInWizardAllowlist('/')).toBe(true);
    expect(isPathInWizardAllowlist('/sign-in')).toBe(true);
    expect(isPathInWizardAllowlist('/help/credentials')).toBe(true);
    expect(isPathInWizardAllowlist('/secretary/create-show/wizard')).toBe(true);
    expect(isPathInWizardAllowlist('/secretary/dashboard')).toBe(true);
  });

  it('allows show landing pages and their sub-paths (premium entry, etc.)', () => {
    expect(isPathInWizardAllowlist('/shows/abc-123')).toBe(true);
    expect(isPathInWizardAllowlist('/shows/abc-123/entry-blank')).toBe(true);
  });

  it('allows a secretary viewing their own show workbench', () => {
    expect(isPathInWizardAllowlist('/secretary/shows/some-id')).toBe(true);
  });

  it('blocks scoring, admin, exhibitor, and judge surfaces', () => {
    expect(isPathInWizardAllowlist('/scoring/something')).toBe(false);
    expect(isPathInWizardAllowlist('/admin/users')).toBe(false);
    expect(isPathInWizardAllowlist('/exhibitor/entries')).toBe(false);
    expect(isPathInWizardAllowlist('/judge/scoresheet')).toBe(false);
  });

  it('blocks results-control, reports, check-in — features that need scoring/check-in to be useful', () => {
    expect(isPathInWizardAllowlist('/secretary/check-in')).toBe(false);
    expect(isPathInWizardAllowlist('/secretary/results-control')).toBe(false);
    expect(isPathInWizardAllowlist('/secretary/reports')).toBe(false);
    expect(isPathInWizardAllowlist('/secretary/entries')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/setup')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/show-desk')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/entry-management')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/reports')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/results-control')).toBe(false);
    expect(isPathInWizardAllowlist('/shows/abc-123/submit-results')).toBe(false);
  });
});
