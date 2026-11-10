/**
 * MYK9-1844: what the volunteer screens say when a save fails. Each is one database
 * write; the assignment changes are shown at once and put back when they fail.
 */
export const VOLUNTEER_COPY = {
  addFailed: "We couldn't add this volunteer. Try again.",
  updateFailed: "We couldn't save your changes to this volunteer. Try again.",
  deleteFailed: "We couldn't remove this volunteer. They are still on the list. Try again.",
  assignClassFailed: "We couldn't assign this volunteer to the class. Try again.",
  unassignClassFailed: "We couldn't take this volunteer off the class. Try again.",
  assignDutyFailed: "We couldn't assign this volunteer to the duty. Try again.",
  unassignDutyFailed: "We couldn't take this volunteer off the duty. Try again.",
} as const;
