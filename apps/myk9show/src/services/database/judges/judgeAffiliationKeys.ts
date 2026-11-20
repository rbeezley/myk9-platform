/**
 * MYK9-2292: the premium checklist's judge-affiliation query key, in its own module so the
 * replication sync helpers can name it without importing the Supabase client.
 */
export const PREMIUM_JUDGE_AFFILIATIONS_KEY = 'premiumJudgeAffiliations' as const;
