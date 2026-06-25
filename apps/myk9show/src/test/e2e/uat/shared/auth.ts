/**
 * UAT auth helpers — thin re-exports of the canonical sign-in helper.
 *
 * The real SmartSignInPage flow (credential → Continue → password → submit,
 * with boot-retry) lives in one place: `helpers/testUsers.ts`. This module just
 * surfaces the role wrappers the UAT specs use so their import paths stay short.
 */
import { TEST_USERS, signIn, signInAsSecretary, signInAsJudge } from '../../helpers/testUsers';

export const SECRETARY_USER = TEST_USERS.SECRETARY;
export const JUDGE_USER = TEST_USERS.JUDGE;

export { signIn, signInAsSecretary, signInAsJudge };
