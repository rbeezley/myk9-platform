import { describe, expect, it } from 'vitest';
import {
  accessControlErrorUrl,
  describeKeptAccessControlErrors,
  triageAccessControlErrors,
} from './accessControlErrors';

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

describe('triageAccessControlErrors', () => {
  it('excuses access-control errors on a settled route with no recorded failure (run 40980816332)', () => {
    const errors = [errorFor(URL_A), errorFor(URL_A), errorFor(URL_B)];
    expect(triageAccessControlErrors(errors, [], true)).toEqual({ kept: [], excused: errors });
  });

  it('matches a scheme-less localhost error', () => {
    const error = 'localhost:54321/rest/v1/dogs?select=id due to access control checks.';
    expect(triageAccessControlErrors([error], [], true).excused).toEqual([error]);
  });

  it('excuses nothing on a route that did not settle', () => {
    expect(triageAccessControlErrors([errorFor(URL_A)], [], false)).toEqual({
      kept: [errorFor(URL_A)],
      excused: [],
    });
  });

  it('keeps every error for a URL whose request recorded a failure reason', () => {
    const failed = [`Origin not allowed. Status code: 502 | GET ${URL_A}`];
    expect(
      triageAccessControlErrors([errorFor(URL_A), errorFor(URL_A), errorFor(URL_B)], failed, true)
    ).toEqual({ kept: [errorFor(URL_A), errorFor(URL_A)], excused: [errorFor(URL_B)] });
  });

  it('keeps it when a request to that URL got a failed response', () => {
    expect(triageAccessControlErrors([errorFor(URL_A)], [`503 GET ${URL_A}`], true).kept).toEqual([
      errorFor(URL_A),
    ]);
  });

  it('keeps an access-control error for a third-party URL, whose failures are not recorded', () => {
    const error = 'https://js.stripe.com/v3/m/outer.html due to access control checks.';
    expect(triageAccessControlErrors([error], [], true).kept).toEqual([error]);
  });

  it('never excuses another kind of page error', () => {
    const error = `TypeError: ${URL_A} is broken`;
    expect(triageAccessControlErrors([error], [], true).kept).toEqual([error]);
  });
});

describe('describeKeptAccessControlErrors', () => {
  it('says a kept error was never seen, and how many requests shared its path', () => {
    const other = 'http://127.0.0.1:54321/rest/v1/stripe_orders?select=id';
    expect(
      describeKeptAccessControlErrors([errorFor(URL_A)], [{ url: other, outcome: 'finished' }])
    ).toEqual(['127.0.0.1:54321/rest/v1/stripe_orders seen=never same-path-requests=1']);
  });

  it('reports each outcome a request to that URL had', () => {
    expect(
      describeKeptAccessControlErrors(
        [errorFor(URL_A)],
        [
          { url: URL_A, outcome: 'finished' },
          { url: URL_A, outcome: 'failed' },
        ]
      )
    ).toEqual(['127.0.0.1:54321/rest/v1/stripe_orders seen=finished,failed same-path-requests=2']);
  });

  it('describes nothing for page errors of any other kind', () => {
    expect(describeKeptAccessControlErrors(['TypeError: boom'], [])).toEqual([]);
  });
});
