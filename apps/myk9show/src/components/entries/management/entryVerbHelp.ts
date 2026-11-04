/**
 * One line of plain help for each of the three look-alike verbs on the secretary's entry
 * form (MYK9-1687). Pull is "not competing, for any reason"; Withdraw is the two refund
 * reasons; Remove entry is "entered by mistake". Never call Pull "scratch" in copy, and
 * never treat Pull and Withdraw as synonyms.
 */
export const ENTRY_VERB_HELP = {
  pull: 'Not competing, for any reason. No refund promise; the club decides.',
  withdraw: 'Only for In Season or Judge Change. Refund per the premium.',
  remove: 'Entered by mistake. Removes this entry.',
} as const;

/** The status menu's help line for an action id, when that action is one of the verbs. */
export function getStatusActionHelp(actionId: string): string | undefined {
  return actionId === 'pull' ? ENTRY_VERB_HELP.pull : undefined;
}
