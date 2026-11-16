/** A result the scoresheet sent that cannot be written as a score; the judge picks it again. */
export class ScoreResultRefusedError extends Error {
  constructor(result: string) {
    super(`"${result}" is not a result that can be saved. Choose the result again and save.`);
    this.name = 'ScoreResultRefusedError';
  }
}
