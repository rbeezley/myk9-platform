/**
 * MYK9-1844: what the secretary's task lists (the dashboard Tasks tab and a show's
 * Tasks & Notes card) say when a task does not load or save. Updates and deletes
 * are optimistic and put the task back on failure. An add keeps the form open but
 * has already cleared it, so the secretary types the task again.
 */
export const TASK_COPY = {
  updateFailed: "We couldn't save your change to this task. It is back the way it was. Try again.",
  deleteFailed: "We couldn't delete this task. It is still on your list. Try again.",
  addFailed: "We couldn't add this task. Type it again and press Add.",
  /** Beside a Retry button. */
  loadMineFailed: "We couldn't load your tasks. Try again.",
  loadShowFailed: "We couldn't load the tasks for this show. Try again.",
} as const;
