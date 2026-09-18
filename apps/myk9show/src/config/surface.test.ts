import { describe, expect, it } from 'vitest';
import { createRoutesFromChildren } from 'react-router-dom';
import { SHOW_MANAGEMENT_CHILD_ROUTE_PATHS } from '@/routes/showManagementSections';
import { PublicRoutes } from '@/routes/publicRoutes';
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

describe('the wizard surface blocks every management route under /shows/:id', () => {
  // The allowlist carries a blanket `/shows/:id/*`, so a management route
  // MISSING from the blocklist is wide open under the gated early-access
  // surface. A hand-kept copy went stale twice: once when MYK9-630 phase 2
  // renamed the sections, and once on `classes/:trialId`, which was never in it.
  // So the blocklist is derived from the route model and the test walks the
  // REAL route tree to prove that model is the whole list.
  it.each(SHOW_MANAGEMENT_CHILD_ROUTE_PATHS)('blocks /shows/:id/%s', path => {
    const concrete = path.replace(/:[^/]+/g, 'x');
    expect(isPathInWizardAllowlist(`/shows/abc/${concrete}`)).toBe(false);
  });

  it('covers every child route the production tree actually mounts', () => {
    const showRoute = createRoutesFromChildren(PublicRoutes()).find(
      route => route.path === '/shows/:id'
    );
    const childPaths = (showRoute?.children ?? [])
      .map(child => child.path)
      .filter((path): path is string => typeof path === 'string');

    // Known-answer control: a walker that silently returned [] would pass the
    // equality below forever.
    expect(childPaths.length).toBeGreaterThan(5);
    expect([...childPaths].sort()).toEqual([...SHOW_MANAGEMENT_CHILD_ROUTE_PATHS].sort());
  });

  it('still allows the show page itself', () => {
    expect(isPathInWizardAllowlist('/shows/abc')).toBe(true);
  });
});
