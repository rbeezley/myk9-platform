/**
 * MYK9-1208: shared state for the two password forms (Account security and the
 * reset-password page). `submit` runs the step-up check, then the change; when GoTrue asks
 * for an emailed code, `needsCode` turns on and the next `submit` sends it as the nonce.
 */
import { useState } from 'react';
import { changePassword, PasswordNonceRequired } from './passwordChange';

export function usePasswordChange(options: { acceptRecoverySession?: boolean } = {}) {
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');

  const submit = async (newPassword: string): Promise<void> => {
    try {
      await changePassword(newPassword, {
        ...options,
        ...(needsCode && code.trim() ? { nonce: code } : {}),
      });
      setNeedsCode(false);
      setCode('');
    } catch (error) {
      if (error instanceof PasswordNonceRequired) setNeedsCode(true);
      throw error;
    }
  };

  return { submit, needsCode, code, setCode };
}
