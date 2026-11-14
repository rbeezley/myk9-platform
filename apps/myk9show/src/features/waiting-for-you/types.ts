/**
 * A list's "waiting for you" answer: the rows themselves, and `count`, which is always
 * `rows.length`, so a pill or menu badge built from `count` equals what the list shows.
 */
export interface WaitingList<Row> {
  count: number;
  rows: Row[];
}
