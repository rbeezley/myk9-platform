import type { PolicyDefinitionSignature } from './permissivePolicySqlContract';

// Regenerate only after comparing every policy definition with the reviewed catalog snapshot.
export const expectedForwardPolicySignature: PolicyDefinitionSignature = {
  count: 58,
  digest: '613108ce91201597ac6d6a809940adf1d2784ea103eb7d6b69f8c9a07659c9d8',
};

export const expectedRollbackPolicySignature: PolicyDefinitionSignature = {
  count: 70,
  digest: '89081f88cf408654e11b2d7e3da3403e5da3e53574d9d682dffe6bcfa1dd2626',
};
