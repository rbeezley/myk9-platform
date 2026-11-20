// Stand-in for 'npm:stripe@17.7.0' so a test can import an edge function's
// index.ts (MYK9-2187). A test that reaches Stripe must vi.mock it with the
// behaviour it needs; this one refuses to pretend.
export default class StripeStub {
  constructor() {
    throw new Error(
      "npm:stripe is not available in vitest: vi.mock('npm:stripe@17.7.0') in the test"
    );
  }
}
