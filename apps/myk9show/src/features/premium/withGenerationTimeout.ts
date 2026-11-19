const GENERATION_TIMEOUT_MS = 20_000;

export function withGenerationTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error('We could not finish generating this content. Please try again in a moment.')
      );
    }, GENERATION_TIMEOUT_MS);

    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      err => {
        window.clearTimeout(timeout);
        reject(err);
      }
    );
  });
}
