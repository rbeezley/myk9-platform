import { relative, sep } from 'node:path';

/** Forward-slash form of a path, so file inventories compare the same on Windows and POSIX. */
export function toPosixPath(path: string): string {
  return sep === '\\' ? path.split(sep).join('/') : path;
}

/** `path.relative` that always answers with forward slashes. */
export function relativePosix(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}
