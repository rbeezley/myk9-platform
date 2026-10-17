/**
 * MYK9-1208: the one place a step-up confirmation is asked for and answered.
 *
 * The server refuses a refund or a role change when the session has not re-authenticated
 * in the last five minutes. `stepUpFetch` notices the refusal and calls `requestStepUp`;
 * `StepUpReauthDialog` (mounted once at the app root) shows the prompt and calls
 * `settleStepUp` with the new access token, or null when the person cancels.
 *
 * Concurrent refusals share one prompt: a second request arriving while the dialog is open
 * waits on the same answer.
 */
import { create } from 'zustand';

export interface StepUpAccount {
  userId: string;
  email: string;
  /** False for Google or Apple accounts with no password: they confirm with an emailed code. */
  hasPassword: boolean;
}

interface StepUpState {
  /** Set while a prompt is showing; null otherwise. */
  account: StepUpAccount | null;
  /** Bumped per prompt, so each prompt starts with an empty form. */
  promptId: number;
  /** Registered by the mounted dialog. With no dialog there is no one to ask. */
  loadAccount: (() => Promise<StepUpAccount | null>) | null;
  pending: Promise<string | null> | null;
  resolve: ((accessToken: string | null) => void) | null;
}

const initialState: StepUpState = {
  account: null,
  promptId: 0,
  loadAccount: null,
  pending: null,
  resolve: null,
};

export const useStepUpStore = create<StepUpState>()(() => ({ ...initialState }));

/** Called by the dialog host on mount; returns its unregister function. */
export function registerStepUpHost(loadAccount: () => Promise<StepUpAccount | null>): () => void {
  useStepUpStore.setState({ loadAccount });
  return () => {
    if (useStepUpStore.getState().loadAccount === loadAccount) {
      settleStepUp(null);
      useStepUpStore.setState({ loadAccount: null });
    }
  };
}

/**
 * Ask the person to confirm who they are. Resolves with the new session's access token,
 * or null when they cancel, when nobody is signed in, or when no dialog is mounted.
 */
export function requestStepUp(): Promise<string | null> {
  const { pending, loadAccount } = useStepUpStore.getState();
  if (pending) return pending;
  if (!loadAccount) return Promise.resolve(null);

  let resolve: (accessToken: string | null) => void = () => {};
  const next = new Promise<string | null>(r => {
    resolve = r;
  });
  useStepUpStore.setState({ pending: next, resolve });

  loadAccount()
    .then(account => {
      if (useStepUpStore.getState().pending !== next) return;
      if (account) useStepUpStore.setState(state => ({ account, promptId: state.promptId + 1 }));
      else settleStepUp(null);
    })
    .catch(() => settleStepUp(null));

  return next;
}

/** Close the prompt and answer everyone waiting on it. */
export function settleStepUp(accessToken: string | null): void {
  const { resolve } = useStepUpStore.getState();
  useStepUpStore.setState({ account: null, pending: null, resolve: null });
  resolve?.(accessToken);
}

/** Test seam: back to a fresh, unmounted store. */
export function resetStepUpStore(): void {
  useStepUpStore.setState({ ...initialState });
}
