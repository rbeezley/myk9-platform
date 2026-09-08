import { exportDatabase } from './export';
import { redactError } from './export-model';

try {
  exportDatabase();
} catch (error) {
  console.error(redactError(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
