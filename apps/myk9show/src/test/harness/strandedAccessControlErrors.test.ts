import { describe, expect, it } from 'vitest';
import {
  accessControlErrorUrl,
  triageStrandedAccessControlErrors,
} from './strandedAccessControlErrors';

const URL_A = 'http://127.0.0.1:54321/rest/v1/stripe_orders?select=id&order=created_at.desc';
const URL_B = 'http://127.0.0.1:54321/rest/v1/classes?select=id';
// The shape run 40962869226 printed: scheme gone, one leading slash left.
const errorFor = (url: string) => `${url.replace(/^http:\//, '')} due to access control checks.`;

describe('accessControlErrorUrl', () => {
  it('reads the URL from the CI message shape and from a full URL', () => {
    expect(accessControlErrorUrl(errorFor(URL_A))).toBe(
      '127.0.0.1:54321/rest/v1/stripe_orders?select=id&order=created_at.desc'
    );
    expect(
      accessControlErrorUrl(`Fetch API cannot load ${URL_B} due to access control checks.`)
    ).toBe('127.0.0.1:54321/rest/v1/classes?select=id');
  });

  it('keeps a scheme-less host with a port', () => {
    expect(
      accessControlErrorUrl('localhost:54321/rest/v1/dogs?select=id due to access control checks.')
    ).toBe('localhost:54321/rest/v1/dogs?select=id');
  });

  it('is null for any other page error', () => {
    expect(accessControlErrorUrl('TypeError: undefined is not an object')).toBeNull();
  });
});

describe('triageStrandedAccessControlErrors', () => {
  it('excuses an access-control error whose request was stranded with no outcome', () => {
    expect(triageStrandedAccessControlErrors([errorFor(URL_A)], [URL_A], [], true)).toEqual({
      kept: [],
      excused: [errorFor(URL_A)],
    });
  });

  it('matches a scheme-less localhost error to its stranded request', () => {
    const url = 'http://localhost:54321/rest/v1/dogs?select=id';
    const error = 'localhost:54321/rest/v1/dogs?select=id due to access control checks.';
    expect(triageStrandedAccessControlErrors([error], [url], [], true).excused).toEqual([error]);
  });

  it('excuses nothing on a route that did not settle, where the URL alone cannot attribute it', () => {
    // Codex round 3: an incoming request to the same URL could fail with no
    // outcome. It would still be pending, so the route cannot have settled.
    expect(triageStrandedAccessControlErrors([errorFor(URL_A)], [URL_A], [], false)).toEqual({
      kept: [errorFor(URL_A)],
      excused: [],
    });
  });

  it('keeps an access-control error for a request that was never stranded', () => {
    expect(triageStrandedAccessControlErrors([errorFor(URL_B)], [URL_A], [], true).kept).toEqual([
      errorFor(URL_B),
    ]);
  });

  it('keeps it when a request to that URL recorded a failure reason', () => {
    const failed = [`Origin not allowed. Status code: 502 | GET ${URL_A}`];
    expect(
      triageStrandedAccessControlErrors([errorFor(URL_A)], [URL_A], failed, true).kept
    ).toEqual([errorFor(URL_A)]);
  });

  it('keeps it when a request to that URL got a failed response', () => {
    const failed = [`503 GET ${URL_A}`];
    expect(
      triageStrandedAccessControlErrors([errorFor(URL_A)], [URL_A], failed, true).kept
    ).toEqual([errorFor(URL_A)]);
  });

  it('excuses one error per stranded request, never more', () => {
    const errors = [errorFor(URL_A), errorFor(URL_A)];
    expect(triageStrandedAccessControlErrors(errors, [URL_A], [], true)).toEqual({
      kept: [errorFor(URL_A)],
      excused: [errorFor(URL_A)],
    });
  });

  it('never excuses another kind of page error, even with stranded requests', () => {
    const error = `TypeError: ${URL_A} is broken`;
    expect(triageStrandedAccessControlErrors([error], [URL_A], [], true).kept).toEqual([error]);
  });
});
