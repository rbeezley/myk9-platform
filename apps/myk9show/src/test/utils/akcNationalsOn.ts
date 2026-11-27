/**
 * AKC Nationals is hidden in the app (MYK9-2488, `features/registries/akcNationals.ts`).
 * The tests that cover Nationals as built switch it on with this stand-in:
 *
 *   vi.mock('@/features/registries/akcNationals', async () =>
 *     (await import('@/test/utils/akcNationalsOn')).akcNationalsOn
 *   );
 */
export const akcNationalsOn = {
  AKC_NATIONALS_ENABLED: true,
  isAkcNationalsEnabled: (): boolean => true,
  showIsNationals: (
    show: { isNationals?: boolean | null | undefined } | null | undefined
  ): boolean => show?.isNationals === true,
};
